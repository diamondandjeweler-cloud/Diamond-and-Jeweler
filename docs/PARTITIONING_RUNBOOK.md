# Partitioning Runbook — `audit_log`, `notification_outbox`, `match_history`

> ## ⛔ REHEARSE ON STAGING FIRST — NEVER RUN DIRECTLY ON PROD ⛔
>
> Every block below is a **table-rewriting, destructive** operation (rename + create
> partitioned parent + copy rows + swap). It MUST be rehearsed end-to-end against a
> **fresh staging snapshot** of prod, timed, and reviewed before any production run —
> which then happens only inside a scheduled maintenance window with a fresh PITR
> snapshot taken immediately beforehand. **Nothing in this document is applied by the
> migration runner.** It is the deferred companion to the "PARTITION PLAN" comment in
> `supabase/migrations/0164_notification_outbox_retention.sql` and §5.3 of
> `docs/SCALABILITY.md`.

---

## Why this exists

Three tables are **append-mostly and grow unbounded**:

| Table | Source migration | Today's retention | Retention cost today |
|---|---|---|---|
| `public.audit_log` | `0063_audit_log.sql` | 730 days (compliance) | `DELETE … WHERE created_at < now()-'730 days'` monthly cron `purge-old-audit-log` (0063) |
| `public.notification_outbox` | `0085_notification_outbox.sql` | 60 days (terminal rows only) | `DELETE …` daily cron `dnj-purge-notification-outbox-daily` (0164) |
| `public.match_history` | `0001_schema.sql` | none yet (TBD on cutover) | n/a — grows forever |

Those `DELETE` crons churn the heap and the indexes and make autovacuum work harder
(which is exactly why `0137_perf_pack_v2.sql` #20 tightened autovacuum on `audit_log`
and `notification_outbox`). Converting each table to **monthly `RANGE(created_at)`
partitions** turns retention into a metadata-only `DROP TABLE <partition>` /
`DETACH PARTITION` — no heap churn, no index bloat, instant.

The conversion uses the **safe rename-swap pattern** for every table:

```
1. rename live table          ->  <t>_legacy
2. create partitioned parent  ->  <t>   (PARTITION BY RANGE (created_at))
3. pre-create monthly partitions  (min(created_at) .. now()+N months)
4. backfill                       INSERT … SELECT from <t>_legacy   (batched)
5. recreate indexes / RLS / policies / grants / triggers on the parent
6. verify                         (row counts, sample queries, pre-create cron)
7. cutover + keep <t>_legacy for a safety window, then drop
```

---

## ⚠️ The partition-key gotcha (read before touching any table)

In a partitioned table, **every `PRIMARY KEY` and every `UNIQUE` constraint must
include the partition key column (`created_at`)**. Postgres cannot enforce a
uniqueness constraint that doesn't cover the partition key, because each partition is
a separate physical table.

This bites two of our three tables differently:

- **`audit_log`** — PK is `id bigserial` **only**. To keep a usable PK on the
  partitioned parent it must become a **composite** `PRIMARY KEY (id, created_at)`.
  `id` stays globally unique in practice (it's a single `bigserial` sequence shared by
  all partitions, so values never collide), but the *declared* PK is the pair. Any
  external code or FK that assumes a single-column PK on `audit_log` must be checked —
  there are **no inbound FKs to `audit_log`** in the schema (it only has outbound FKs
  to `auth.users`), so this is safe here.
- **`match_history`** — PK is `id uuid` (`gen_random_uuid()`) **only**. Same rule: the
  partitioned PK becomes `PRIMARY KEY (id, created_at)`. `match_history` is referenced
  by **no FK** (the `previous_match_id uuid` column is a bare uuid with no FK
  constraint), so widening the PK has no downstream impact.
- **`notification_outbox`** — PK is `id uuid` **only**; becomes
  `PRIMARY KEY (id, created_at)`. It is referenced by no FK. Its `next_retry_at`
  partial index does **not** involve a unique constraint, so it ports unchanged.

> Because all three `created_at` columns are `NOT NULL DEFAULT now()`, no row can ever
> fall outside a partition for a NULL key — but you still need a partition that covers
> the row's timestamp at insert time (see the pre-create cron in step 6).

---

## Pre-flight checklist (do this for the WHOLE run, before any table)

- [ ] **REHEARSE on a staging clone first.** Restore a recent prod snapshot into a
      separate Supabase project / branch. Run this entire runbook there, fix anything,
      and **time each backfill** so you can size the maintenance window.
- [ ] **Fresh PITR snapshot of prod** taken immediately before the production run.
      PITR is the only rollback for a project-wide mistake (`docs/SCALABILITY.md` §5.3).
- [ ] **Low-traffic maintenance window.** Pick the trough (Malaysia-first pilot →
      ~18:00–22:00 UTC is deep night MYT). Announce it.
- [ ] **Quiesce writers to the table being converted.** The rename in step 1 takes an
      `ACCESS EXCLUSIVE` lock; any concurrent insert blocks behind it. For
      `audit_log` and `match_history`, writes come from **triggers and edge functions**
      — pause the relevant pg_cron jobs and/or hold edge traffic. For
      `notification_outbox`, **pause the retry + enqueue path** (`process-*` crons,
      `notify` edge fn) so no row is enqueued mid-swap.
- [ ] **Pause the retention crons for the table** so they don't fire mid-migration:
      `cron.unschedule('purge-old-audit-log')` and
      `cron.unschedule('dnj-purge-notification-outbox-daily')` — you will re-create them
      as `DROP PARTITION`-based jobs in step 7.
- [ ] **Lock considerations.** Do the rename-swap inside a single transaction per table
      where possible so readers never see a missing table; but **the backfill
      `INSERT … SELECT` for large tables should run OUTSIDE the swap transaction, in
      batches**, to avoid one giant long transaction holding locks / bloating WAL. The
      pattern below keeps the swap fast (rename + create parent) and does the heavy copy
      afterward against `<t>_legacy` (which still exists), then attaches/loads.
- [ ] **`pg_partman` availability.** If you intend to use `pg_partman` for ongoing
      partition maintenance, confirm the extension is available on the Supabase plan:
      `create extension if not exists pg_partman schema partman;`
      If it is **not** available, use the hand-rolled pre-create cron shown in step 6b
      (same `unschedule-if-exists` DO-block idiom as the existing purge jobs).
- [ ] **Decide `match_history` retention.** It has none today. Per the 0164 plan note,
      align with `audit_log` (730 days) unless product/compliance specifies shorter.
      Set `RETENTION_DAYS_MATCH_HISTORY` before writing its DROP-PARTITION cron.

---

# Table 1 — `public.audit_log`

Real shape (from `0063_audit_log.sql`, `0131_perf_brin_indexes.sql`,
`0137_perf_pack_v2.sql`, `0138_rls_authuid_wrap.sql`, `0103_admin_visibility_v2.sql`):

- PK `id bigserial`; `created_at timestamptz not null default now()`.
- CHECK constraint `audit_log_action_check` (large `action in (...)` allow-list).
- Outbound FKs: `actor_id`, `subject_id` → `auth.users(id) on delete set null`.
- Indexes: `idx_audit_log_subject_id`, `idx_audit_log_actor_id`,
  `idx_audit_log_created_at`, `idx_audit_log_action`, `idx_audit_log_created_brin`.
- RLS: `enable` **+ `force`**; policies `audit_log_insert`,
  `audit_log_select_own` (wrapped `(select auth.uid())`), `audit_log_select_admin`.
- Grant: `grant select on public.audit_log to authenticated;`
- Autovacuum: `autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.025`.
- Triggers on `audit_log` itself: **none** (the audit triggers live on `profiles` /
  `data_requests` and only *insert into* `audit_log`; nothing needs re-creating on the
  table). Sequence: the implicit `audit_log_id_seq` from `bigserial`.

### Step 1 — rename the live table out of the way

```sql
ALTER TABLE public.audit_log RENAME TO audit_log_legacy;
-- rename the indexes too, so the new parent can reuse the canonical names:
ALTER INDEX public.idx_audit_log_subject_id   RENAME TO idx_audit_log_subject_id_legacy;
ALTER INDEX public.idx_audit_log_actor_id     RENAME TO idx_audit_log_actor_id_legacy;
ALTER INDEX public.idx_audit_log_created_at   RENAME TO idx_audit_log_created_at_legacy;
ALTER INDEX public.idx_audit_log_action       RENAME TO idx_audit_log_action_legacy;
ALTER INDEX public.idx_audit_log_created_brin RENAME TO idx_audit_log_created_brin_legacy;
```

### Step 2 — create the partitioned parent (same columns / types / defaults / constraints)

Spelled out in full (NOT `LIKE`) so the composite PK and the action CHECK are explicit.
The `bigserial` is reproduced as `bigint` + an owned sequence so `id` keeps
auto-incrementing across all partitions from a single sequence.

```sql
-- one shared sequence drives id across every partition
CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq;

CREATE TABLE public.audit_log (
  id            bigint        NOT NULL DEFAULT nextval('public.audit_log_id_seq'),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  actor_id      uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role    text,
  subject_id    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  action        text          NOT NULL,
  resource_type text,
  resource_id   text,
  ip_hash       text,
  ua_hash       text,
  metadata      jsonb         DEFAULT '{}',
  -- GOTCHA: partition key (created_at) MUST be in the PK
  CONSTRAINT audit_log_pkey PRIMARY KEY (id, created_at),
  CONSTRAINT audit_log_action_check CHECK (action IN (
    'login','logout','login_failed','session_expired',
    'password_changed','password_reset_requested',
    'mfa_enrolled','mfa_challenge_passed','mfa_challenge_failed',
    'account_created','account_soft_deleted','account_restored','profile_updated',
    'consent_granted','consent_revoked','consent_renewed',
    'dsr_submitted','dsr_completed','dsr_export_downloaded',
    'admin_profile_view','admin_talent_view','admin_file_view','admin_action',
    'file_uploaded','file_deleted','file_viewed',
    'match_generated','match_accepted','match_declined','match_expired',
    'offer_made','offer_accepted','offer_declined',
    'breach_detected','breach_notified_dpo','breach_notified_user',
    'data_purged','cron_run'
  ))
) PARTITION BY RANGE (created_at);

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;
-- keep the id sequence ahead of the legacy table's max id:
SELECT setval('public.audit_log_id_seq',
              (SELECT COALESCE(MAX(id), 1) FROM public.audit_log_legacy));

-- preserve autovacuum tuning (0137 #20) on the parent
ALTER TABLE public.audit_log SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.025
);
```

### Step 3 — pre-create monthly partitions: `min(created_at) .. now()+3 months`

```sql
-- A default partition catches any stray/out-of-range row so an insert never errors.
CREATE TABLE public.audit_log_default PARTITION OF public.audit_log DEFAULT;

DO $$
DECLARE
  v_start date := date_trunc('month',
                    COALESCE((SELECT min(created_at) FROM public.audit_log_legacy), now()))::date;
  v_end   date := (date_trunc('month', now()) + interval '3 months')::date;  -- now()+N months
  v_m     date;
  v_name  text;
BEGIN
  v_m := v_start;
  WHILE v_m < v_end LOOP
    v_name := format('audit_log_%s', to_char(v_m, 'YYYY_MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_log
         FOR VALUES FROM (%L) TO (%L)',
      v_name, v_m, (v_m + interval '1 month')::date
    );
    v_m := (v_m + interval '1 month')::date;
  END LOOP;
END $$;
```

> Alternatively with **pg_partman** (if available), replace steps 3 + 6b with:
> ```sql
> SELECT partman.create_parent(
>   p_parent_table := 'public.audit_log',
>   p_control      := 'created_at',
>   p_type         := 'range',
>   p_interval     := '1 month',
>   p_premake      := 3
> );
> -- then schedule partman maintenance via pg_cron:
> SELECT cron.schedule('partman-maintenance','30 3 * * *',$$CALL partman.run_maintenance()$$);
> ```

### Step 4 — backfill from legacy (BATCHED — `audit_log` is the largest of the three)

`audit_log` can be the biggest table (every auth event). Do **not** copy it in one
statement on prod. Copy month-by-month so each `INSERT` lands in exactly one partition
and each transaction is bounded:

```sql
DO $$
DECLARE
  v_start date := date_trunc('month',
                    COALESCE((SELECT min(created_at) FROM public.audit_log_legacy), now()))::date;
  v_m     date := v_start;
BEGIN
  WHILE v_m <= date_trunc('month', now())::date LOOP
    INSERT INTO public.audit_log
      (id, created_at, actor_id, actor_role, subject_id, action,
       resource_type, resource_id, ip_hash, ua_hash, metadata)
    SELECT
       id, created_at, actor_id, actor_role, subject_id, action,
       resource_type, resource_id, ip_hash, ua_hash, metadata
    FROM public.audit_log_legacy
    WHERE created_at >= v_m
      AND created_at <  (v_m + interval '1 month')::date;
    RAISE NOTICE 'audit_log backfilled month %', to_char(v_m,'YYYY-MM');
    v_m := (v_m + interval '1 month')::date;
  END LOOP;
END $$;
```

> For a very large legacy table, run each month as its own statement from the client
> (commit between months) rather than one DO-block transaction, to cap WAL growth and
> lock duration.

### Step 5 — recreate indexes / RLS / policies / grants on the parent

Indexes (created on the parent automatically propagate to every partition):

```sql
CREATE INDEX idx_audit_log_subject_id   ON public.audit_log (subject_id, created_at DESC);
CREATE INDEX idx_audit_log_actor_id     ON public.audit_log (actor_id,   created_at DESC);
CREATE INDEX idx_audit_log_created_at   ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_action       ON public.audit_log (action,     created_at DESC);
CREATE INDEX idx_audit_log_created_brin ON public.audit_log USING brin (created_at);
```

RLS — **does NOT carry across; re-enable + re-FORCE + recreate all three policies**
(note `select_own` keeps the 0138 `(select auth.uid())` plan-cache wrap):

```sql
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE  ROW LEVEL SECURITY;

CREATE POLICY audit_log_insert
  ON public.audit_log FOR INSERT
  WITH CHECK (true);

CREATE POLICY audit_log_select_own
  ON public.audit_log FOR SELECT
  USING (subject_id = (select auth.uid()));

CREATE POLICY audit_log_select_admin
  ON public.audit_log FOR SELECT
  USING (exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  ));
```

Grants (from `0103_admin_visibility_v2.sql`):

```sql
GRANT SELECT ON public.audit_log TO authenticated;
```

> Triggers: none on `audit_log` itself (the consent / delete / DSR triggers live on
> other tables and only INSERT here — they keep working unchanged). The
> `log_audit_event` RPC also keeps working: it inserts by column name, so the composite
> PK and the shared sequence are transparent to it.

### Step 6 — verify `audit_log`

```sql
-- 6a. row counts match
SELECT (SELECT count(*) FROM public.audit_log_legacy) AS legacy,
       (SELECT count(*) FROM public.audit_log)        AS partitioned;

-- partitions exist and are routed
SELECT inhrelid::regclass AS partition
FROM pg_inherits WHERE inhparent = 'public.audit_log'::regclass ORDER BY 1;

-- sample queries hit a single partition (check the plan prunes)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.audit_log
WHERE created_at >= now() - interval '7 days' ORDER BY created_at DESC LIMIT 50;

-- RLS still scoped: a non-admin sees only subject_id = self; admin sees all
-- (run as a test JWT in staging).

-- nothing landed in the default partition (means month coverage was complete)
SELECT count(*) FROM public.audit_log_default;
```

### Step 6b — ongoing pre-create cron (if NOT using pg_partman)

Adds next month's partition ahead of time, same `unschedule-if-exists` DO-block idiom
as the purge jobs in 0063 / 0164:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dnj-precreate-audit-log-monthly') THEN
    PERFORM cron.unschedule('dnj-precreate-audit-log-monthly');
  END IF;
  PERFORM cron.schedule(
    'dnj-precreate-audit-log-monthly',
    '0 2 25 * *',  -- 25th of each month, 02:00 UTC — well before month rollover
    $job$
      DO $inner$
      DECLARE
        v_next date := (date_trunc('month', now()) + interval '1 month')::date;
        v_name text := format('audit_log_%s', to_char(v_next,'YYYY_MM'));
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_log
             FOR VALUES FROM (%L) TO (%L)',
          v_name, v_next, (v_next + interval '1 month')::date);
      END $inner$;
    $job$
  );
END $$;
```

### Step 7 — cutover + retention becomes `DROP PARTITION`

`audit_log` retention (730 days) is now a metadata op. Replace the 0063 `DELETE` cron:

```sql
-- old DELETE-based purge is gone (unscheduled in pre-flight); register the cheap one:
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-audit-log') THEN
    PERFORM cron.unschedule('purge-old-audit-log');
  END IF;
  PERFORM cron.schedule(
    'dnj-drop-old-audit-log-partitions',
    '0 3 1 * *',  -- 1st of month 03:00 UTC, same cadence as before
    $job$
      DO $inner$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT inhrelid::regclass AS part
          FROM pg_inherits
          WHERE inhparent = 'public.audit_log'::regclass
            AND inhrelid::regclass::text ~ '_\d{4}_\d{2}$'
        LOOP
          -- drop any partition whose whole range is older than 730 days
          IF (regexp_replace(r.part::text, '.*_(\d{4})_(\d{2})$', '\1-\2-01')::date
              + interval '1 month') < (now() - interval '730 days') THEN
            EXECUTE format('DROP TABLE IF EXISTS %s', r.part);
          END IF;
        END LOOP;
      END $inner$;
    $job$
  );
END $$;
```

Keep `audit_log_legacy` for a **safety window** (recommend ≥ 1 full retention cycle of
verification, or at minimum 7–14 days). Then:

```sql
DROP TABLE public.audit_log_legacy;
```

### ROLLBACK — `audit_log`

If anything looks wrong **before** dropping `audit_log_legacy`, revert instantly (the
legacy table is untouched and still holds every row):

```sql
BEGIN;
  DROP TABLE public.audit_log;                       -- drops parent + all partitions + new indexes/policies
  ALTER TABLE public.audit_log_legacy RENAME TO audit_log;
  ALTER INDEX public.idx_audit_log_subject_id_legacy   RENAME TO idx_audit_log_subject_id;
  ALTER INDEX public.idx_audit_log_actor_id_legacy     RENAME TO idx_audit_log_actor_id;
  ALTER INDEX public.idx_audit_log_created_at_legacy   RENAME TO idx_audit_log_created_at;
  ALTER INDEX public.idx_audit_log_action_legacy       RENAME TO idx_audit_log_action;
  ALTER INDEX public.idx_audit_log_created_brin_legacy RENAME TO idx_audit_log_created_brin;
COMMIT;
-- re-register the original DELETE purge cron (0063) and unschedule the partition crons.
```

> Rows written to the partitioned `audit_log` between cutover and rollback would be lost
> by a naive drop — if writers were live in that window, first
> `INSERT INTO audit_log_legacy SELECT * FROM audit_log` the delta back before dropping.
> (With writers quiesced per the pre-flight, the delta is empty.)

---

# Table 2 — `public.notification_outbox`

Real shape (from `0085_notification_outbox.sql`, `0137_perf_pack_v2.sql`,
`0164_notification_outbox_retention.sql`):

- PK `id uuid default gen_random_uuid()`; `created_at timestamptz not null default now()`.
- FK: `user_id → auth.users(id) on delete cascade`.
- CHECK on `status in ('pending','sent','failed','skipped')`.
- Indexes: `idx_notification_outbox_pending_retry` (**partial**, `WHERE status='failed'
  AND attempt_count < max_attempts`), `idx_notification_outbox_user`,
  `idx_notification_outbox_status`.
- RLS: `enable`; policy `notification_outbox_admin_all` (FOR ALL TO authenticated,
  `is_admin()`).
- Trigger on the table: `trg_notification_outbox_updated_at` (BEFORE UPDATE →
  `set_notification_outbox_updated_at()`).
- Autovacuum tuning (0137 #20).
- Retention: 60 days, terminal rows only, daily cron `dnj-purge-notification-outbox-daily`.

> **Quiesce note:** this is a live **operational queue**, not just an audit trail. Pause
> the enqueue path (`enqueue_notification` callers / `notify` edge fn) **and** the retry
> drain (`claim_notification_retry_batch` cron) for the whole swap so no row is written
> or claimed mid-migration.

### Step 1 — rename out of the way

```sql
ALTER TABLE public.notification_outbox RENAME TO notification_outbox_legacy;
ALTER INDEX public.idx_notification_outbox_pending_retry RENAME TO idx_notification_outbox_pending_retry_legacy;
ALTER INDEX public.idx_notification_outbox_user          RENAME TO idx_notification_outbox_user_legacy;
ALTER INDEX public.idx_notification_outbox_status        RENAME TO idx_notification_outbox_status_legacy;
-- drop the legacy table's updated_at trigger so it doesn't fire during backfill reads (optional; it's BEFORE UPDATE only)
```

### Step 2 — create the partitioned parent (same columns / types / defaults / constraints)

```sql
CREATE TABLE public.notification_outbox (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_type     text          NOT NULL,
  payload         jsonb         NOT NULL DEFAULT '{}'::jsonb,
  channel         text          NOT NULL DEFAULT 'email',
  status          text          NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','failed','skipped')),
  attempt_count   int           NOT NULL DEFAULT 0,
  max_attempts    int           NOT NULL DEFAULT 3,
  last_error      text,
  next_retry_at   timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  -- GOTCHA: partition key (created_at) MUST be in the PK
  CONSTRAINT notification_outbox_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

ALTER TABLE public.notification_outbox SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.025
);
```

### Step 3 — pre-create monthly partitions (`min(created_at)..now()+3 months`)

Because retention is only 60 days, the historical span is short — but the loop is
identical:

```sql
CREATE TABLE public.notification_outbox_default PARTITION OF public.notification_outbox DEFAULT;

DO $$
DECLARE
  v_start date := date_trunc('month',
                    COALESCE((SELECT min(created_at) FROM public.notification_outbox_legacy), now()))::date;
  v_end   date := (date_trunc('month', now()) + interval '3 months')::date;
  v_m     date := v_start;
BEGIN
  WHILE v_m < v_end LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.notification_outbox
         FOR VALUES FROM (%L) TO (%L)',
      format('notification_outbox_%s', to_char(v_m,'YYYY_MM')),
      v_m, (v_m + interval '1 month')::date);
    v_m := (v_m + interval '1 month')::date;
  END LOOP;
END $$;
```

### Step 4 — backfill (table is small after 60-day retention; single statement is fine)

```sql
INSERT INTO public.notification_outbox
  (id, user_id, notify_type, payload, channel, status, attempt_count,
   max_attempts, last_error, next_retry_at, sent_at, created_at, updated_at)
SELECT
   id, user_id, notify_type, payload, channel, status, attempt_count,
   max_attempts, last_error, next_retry_at, sent_at, created_at, updated_at
FROM public.notification_outbox_legacy;
```

> If the table is unexpectedly large, batch by month as in `audit_log` step 4.

### Step 5 — recreate indexes / RLS / policy / grants / trigger on the parent

```sql
-- partial retry index (ports unchanged — no unique constraint involved)
CREATE INDEX idx_notification_outbox_pending_retry
  ON public.notification_outbox (next_retry_at)
  WHERE status = 'failed' AND attempt_count < max_attempts;
CREATE INDEX idx_notification_outbox_user
  ON public.notification_outbox (user_id, created_at DESC);
CREATE INDEX idx_notification_outbox_status
  ON public.notification_outbox (status, created_at);

-- RLS (re-enable + recreate the single admin policy)
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_outbox_admin_all ON public.notification_outbox;
CREATE POLICY notification_outbox_admin_all
  ON public.notification_outbox
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- updated_at trigger (function set_notification_outbox_updated_at already exists)
DROP TRIGGER IF EXISTS trg_notification_outbox_updated_at ON public.notification_outbox;
CREATE TRIGGER trg_notification_outbox_updated_at
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_notification_outbox_updated_at();
```

> Grants: `0085` granted no table-level privilege to `authenticated`/`anon` — access is
> via the `is_admin()` RLS policy plus the SECURITY DEFINER RPCs
> (`enqueue_notification`, `claim_notification_retry_batch`,
> `record_notification_attempt`), which keep working unchanged because they reference the
> table by name. **Do not add a new grant** — preserve the 0085 posture (service_role
> bypasses RLS; users never write here).

### Step 6 — verify `notification_outbox`

```sql
SELECT (SELECT count(*) FROM public.notification_outbox_legacy) AS legacy,
       (SELECT count(*) FROM public.notification_outbox)        AS partitioned;

-- the partial retry index is used by the claim path
EXPLAIN (ANALYZE)
SELECT id FROM public.notification_outbox
WHERE status='failed' AND attempt_count < max_attempts
  AND (next_retry_at IS NULL OR next_retry_at <= now())
ORDER BY created_at ASC LIMIT 20;

-- nothing in default partition
SELECT count(*) FROM public.notification_outbox_default;

-- RPCs still operate (run claim_notification_retry_batch / enqueue_notification in staging)
```

Add the same pre-create cron as step 6b (rename table → `notification_outbox`,
jobname `dnj-precreate-notification-outbox-monthly`).

### Step 7 — cutover + retention becomes `DROP PARTITION`

Replace the 0164 `DELETE` cron. **Subtlety:** the 0164 purge only deletes **terminal**
rows (`sent`/`skipped`/exhausted-`failed`), never `pending` or retry-eligible `failed`,
*regardless of age*. A whole-partition drop cannot make that per-row distinction, so:

- Keep monthly partitions and only drop a partition once it is **fully past 60 days**
  AND contains **no non-terminal rows** (a stuck old retry must never be dropped). Guard
  the drop with a check; if non-terminal rows remain, fall back to a row `DELETE` of the
  terminal ones in that partition and leave it in place.

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dnj-purge-notification-outbox-daily') THEN
    PERFORM cron.unschedule('dnj-purge-notification-outbox-daily');
  END IF;
  PERFORM cron.schedule(
    'dnj-drop-old-notification-outbox-partitions',
    '15 3 * * *',  -- same 03:15 UTC daily slot as the old purge
    $job$
      DO $inner$
      DECLARE r record; v_upper date; v_nonterminal bigint;
      BEGIN
        FOR r IN
          SELECT inhrelid::regclass AS part
          FROM pg_inherits
          WHERE inhparent = 'public.notification_outbox'::regclass
            AND inhrelid::regclass::text ~ '_\d{4}_\d{2}$'
        LOOP
          v_upper := (regexp_replace(r.part::text,'.*_(\d{4})_(\d{2})$','\1-\2-01')::date
                      + interval '1 month');
          IF v_upper < (now() - interval '60 days') THEN
            EXECUTE format(
              'SELECT count(*) FROM %s WHERE NOT (status IN (''sent'',''skipped'')
                 OR (status=''failed'' AND attempt_count >= max_attempts))', r.part)
              INTO v_nonterminal;
            IF v_nonterminal = 0 THEN
              EXECUTE format('DROP TABLE IF EXISTS %s', r.part);
            ELSE
              -- stuck retries remain: purge only terminal rows, keep the partition
              EXECUTE format(
                'DELETE FROM %s WHERE status IN (''sent'',''skipped'')
                   OR (status=''failed'' AND attempt_count >= max_attempts)', r.part);
            END IF;
          END IF;
        END LOOP;
      END $inner$;
    $job$
  );
END $$;
```

Keep `notification_outbox_legacy` for the safety window, then `DROP TABLE
public.notification_outbox_legacy;`. **Re-enable the enqueue + retry crons / edge fn**
you paused in pre-flight.

### ROLLBACK — `notification_outbox`

```sql
BEGIN;
  DROP TABLE public.notification_outbox;
  ALTER TABLE public.notification_outbox_legacy RENAME TO notification_outbox;
  ALTER INDEX public.idx_notification_outbox_pending_retry_legacy RENAME TO idx_notification_outbox_pending_retry;
  ALTER INDEX public.idx_notification_outbox_user_legacy          RENAME TO idx_notification_outbox_user;
  ALTER INDEX public.idx_notification_outbox_status_legacy        RENAME TO idx_notification_outbox_status;
COMMIT;
-- recreate trg_notification_outbox_updated_at on the restored table if you dropped it;
-- re-register the 0164 DELETE purge cron; unschedule the partition crons.
```

---

# Table 3 — `public.match_history`

Real shape (from `0001_schema.sql`, `0003_rls.sql`):

- PK `id uuid default gen_random_uuid()`; `created_at timestamptz not null default now()`.
- FKs: `role_id → public.roles(id) on delete set null`,
  `talent_id → public.talents(id) on delete set null`.
- `previous_match_id uuid` — **bare uuid, NO FK constraint**.
- CHECK on `action in ('generated','refreshed_by_manager','refreshed_by_talent',
  'expired_auto','manual_admin')`.
- Index: `idx_match_history_role` on `(role_id)`.
- RLS: `enable`; policy `match_history_admin` (FOR ALL, `is_admin()` / `is_admin()`).
- Trigger on the table: **none**. No grant to `authenticated` (admin-only via RLS).
- Read by `0077_urgent_priority_hardening.sql` (counts `expired_auto` per role).
- **Retention today: none.** Decide `RETENTION_DAYS_MATCH_HISTORY` (default: align with
  `audit_log` → 730 days) before step 7.

> **Quiesce note:** inserts come from the match-generation / expire / refresh edge paths
> and from `manual_admin` actions. Pause the match-gen + expire crons and hold the
> relevant edge traffic during the swap.

### Step 1 — rename out of the way

```sql
ALTER TABLE public.match_history RENAME TO match_history_legacy;
ALTER INDEX public.idx_match_history_role RENAME TO idx_match_history_role_legacy;
```

### Step 2 — create the partitioned parent (same columns / types / defaults / constraints)

```sql
CREATE TABLE public.match_history (
  id                uuid         NOT NULL DEFAULT gen_random_uuid(),
  role_id           uuid         REFERENCES public.roles(id)   ON DELETE SET NULL,
  talent_id         uuid         REFERENCES public.talents(id) ON DELETE SET NULL,
  action            text         NOT NULL CHECK (action IN (
                      'generated','refreshed_by_manager','refreshed_by_talent',
                      'expired_auto','manual_admin')),
  previous_match_id uuid,        -- bare uuid, no FK (matches 0001)
  created_at        timestamptz  NOT NULL DEFAULT now(),
  -- GOTCHA: partition key (created_at) MUST be in the PK
  CONSTRAINT match_history_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- optional but recommended given the write-hot pattern, mirroring 0137 #20:
ALTER TABLE public.match_history SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.025
);
```

### Step 3 — pre-create monthly partitions (`min(created_at)..now()+3 months`)

```sql
CREATE TABLE public.match_history_default PARTITION OF public.match_history DEFAULT;

DO $$
DECLARE
  v_start date := date_trunc('month',
                    COALESCE((SELECT min(created_at) FROM public.match_history_legacy), now()))::date;
  v_end   date := (date_trunc('month', now()) + interval '3 months')::date;
  v_m     date := v_start;
BEGIN
  WHILE v_m < v_end LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.match_history
         FOR VALUES FROM (%L) TO (%L)',
      format('match_history_%s', to_char(v_m,'YYYY_MM')),
      v_m, (v_m + interval '1 month')::date);
    v_m := (v_m + interval '1 month')::date;
  END LOOP;
END $$;
```

### Step 4 — backfill (batch by month if large)

```sql
INSERT INTO public.match_history
  (id, role_id, talent_id, action, previous_match_id, created_at)
SELECT
   id, role_id, talent_id, action, previous_match_id, created_at
FROM public.match_history_legacy;
-- for a large table, wrap in the month-loop pattern from audit_log step 4.
```

### Step 5 — recreate index / RLS / policy on the parent

```sql
CREATE INDEX idx_match_history_role ON public.match_history (role_id);
-- The 0077 hardening filters `role_id = ? AND action = 'expired_auto'`; consider adding
-- a covering index if that count becomes hot post-partition:
--   CREATE INDEX idx_match_history_role_action ON public.match_history (role_id, action);

ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_history_admin ON public.match_history
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
```

> No table grant and no trigger to recreate (there were none). Inserts are by
> service_role (bypasses RLS) per the 0003 comment "inserts by service_role".

### Step 6 — verify `match_history`

```sql
SELECT (SELECT count(*) FROM public.match_history_legacy) AS legacy,
       (SELECT count(*) FROM public.match_history)        AS partitioned;

-- the 0077 read path still works and prunes
EXPLAIN (ANALYZE)
SELECT count(*) FROM public.match_history
WHERE role_id = '00000000-0000-0000-0000-000000000000' AND action = 'expired_auto';

SELECT count(*) FROM public.match_history_default;  -- expect 0
```

Add the pre-create cron as in step 6b (jobname
`dnj-precreate-match-history-monthly`).

### Step 7 — cutover + retention becomes `DROP PARTITION` (NEW retention)

`match_history` had **no** retention. Introduce it as a partition-drop cron using
`RETENTION_DAYS_MATCH_HISTORY` (default 730 to align with `audit_log` per the 0164 note;
shorten only if product/compliance signs off):

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dnj-drop-old-match-history-partitions') THEN
    PERFORM cron.unschedule('dnj-drop-old-match-history-partitions');
  END IF;
  PERFORM cron.schedule(
    'dnj-drop-old-match-history-partitions',
    '30 3 1 * *',  -- monthly
    $job$
      DO $inner$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT inhrelid::regclass AS part
          FROM pg_inherits
          WHERE inhparent = 'public.match_history'::regclass
            AND inhrelid::regclass::text ~ '_\d{4}_\d{2}$'
        LOOP
          IF (regexp_replace(r.part::text,'.*_(\d{4})_(\d{2})$','\1-\2-01')::date
              + interval '1 month') < (now() - interval '730 days') THEN
            EXECUTE format('DROP TABLE IF EXISTS %s', r.part);
          END IF;
        END LOOP;
      END $inner$;
    $job$
  );
END $$;
```

Keep `match_history_legacy` for the safety window, then `DROP TABLE
public.match_history_legacy;`.

### ROLLBACK — `match_history`

```sql
BEGIN;
  DROP TABLE public.match_history;
  ALTER TABLE public.match_history_legacy RENAME TO match_history;
  ALTER INDEX public.idx_match_history_role_legacy RENAME TO idx_match_history_role;
COMMIT;
-- unschedule the partition + pre-create crons. (No prior DELETE cron to restore — there was none.)
```

---

## Post-run summary of retention model change

| Table | Before (interim) | After (partitioned) | Cron renamed |
|---|---|---|---|
| `audit_log` | monthly `DELETE` < 730d (0063) | monthly `DROP TABLE <partition>` < 730d | `purge-old-audit-log` → `dnj-drop-old-audit-log-partitions` |
| `notification_outbox` | daily `DELETE` terminal < 60d (0164) | daily `DROP TABLE <partition>` ≥60d **iff no non-terminal rows**, else row `DELETE` of terminal rows | `dnj-purge-notification-outbox-daily` → `dnj-drop-old-notification-outbox-partitions` |
| `match_history` | none | monthly `DROP TABLE <partition>` < `RETENTION_DAYS_MATCH_HISTORY` (default 730d) | new: `dnj-drop-old-match-history-partitions` |

Plus per-table monthly **pre-create** crons (`dnj-precreate-*-monthly`) — or a single
`partman.run_maintenance()` cron if `pg_partman` is used for all three.

## When this becomes a real migration

Once rehearsed and timed on staging and accepted, the production run is captured as a
**dedicated, manually-applied migration** (next free prefix, `0165+`), clearly headed
"APPLY ONLY IN A MAINTENANCE WINDOW AFTER STAGING REHEARSAL — NOT AUTO-APPLIED", and the
interim `DELETE` purge bodies in `0063` / `0164` are retired in the same change. It is
**not** folded into the normal additive migration stream.
