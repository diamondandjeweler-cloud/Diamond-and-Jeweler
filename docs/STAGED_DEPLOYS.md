# Staged Deploys — WAVE-B (Batch 6)

Ordered manifest the **owner** follows to land the Wave-B backend changes.
Everything here was authored branch-side but **NOT applied** (migrations, edge-fn
deploys, secrets, and cron are HUMAN-GATED — AGENTS.md §4.7/§8).

**Governing safety property:** every `apps/web` change already committed on this
branch is BACKWARD-COMPATIBLE — it works correctly whether or not these
migrations/edge-fns are applied. So the branch (and its Vercel preview) is safe
to merge before the owner applies anything below. Applying each item is a pure,
additive improvement.

Migration numbers are the next-free block after `0193`: **0194–0198**, plus
**0199** (B9, added later in this batch).

---

## Pre-flight

- `deno 2.9` builds are fine; Docker is DOWN, so nothing here was applied
  locally. Apply on the live project.
- Confirm the existing Vault secrets from `0005_cron.sql` still exist:
  `supabase_url`, `service_role_key` (used by the new cron in 0194).
- All migrations are idempotent (`CREATE OR REPLACE`, `IF NOT EXISTS`,
  `unschedule`-before-`schedule`) — safe to re-run.

---

## Item B4 — Wire notification_outbox retry loop (closes failure-mode F3)

**Deploy order matters:** apply the migration FIRST this time (it hardens the
two outbox RPCs the edge fns depend on), then deploy the edge fns, and note the
migration also *schedules* the cron that calls `notification-retry` — so deploy
`notification-retry` before/at the same time as applying 0194.

### Hardened semantics (at-most-once-observable)

`0194` no longer only schedules the cron — it also rebuilds the outbox state
machine so a `record_notification_attempt` failure that lands AFTER a successful
Resend send can never cause a duplicate email (review finding on
`notify/index.ts`). What changed vs. the original 0085 wiring:

- **Two new columns** on `notification_outbox`: `claimed_at` (drives stale
  in-flight recovery) and `provider_message_id` (the Resend id — its presence is
  the de-dupe signal). Status CHECK widened with `'sending'` (claimed, in-flight)
  and `'sent_unconfirmed'` (attempts exhausted mid-flight — probably delivered,
  deliberately NOT resent).
- **`claim_notification_retry_batch` (CREATE OR REPLACE, same signature)** now
  flips a claimed row to `'sending'` **and spends one attempt** (`attempt_count+1`,
  `claimed_at=now()`) BEFORE `notify` re-hits Resend. Two cron ticks can't both
  send the same row (FOR UPDATE SKIP LOCKED + the flip), and physical sends per
  row are hard-capped at `max_attempts`. It also recovers *stranded in-flight*
  rows (a `'sending'` row whose sender crashed >2 min ago, or a fresh `'pending'`
  row whose bookkeeping never landed >5 min ago) and retires exhausted in-flight
  rows to terminal `'sent_unconfirmed'`.
- **`record_notification_attempt` (CREATE OR REPLACE, same signature)** is now
  idempotent (a no-op once the row is terminal), does NOT double-count an attempt
  already spent by the claim, and caps at `max_attempts` → terminal `'failed'`
  (`next_retry_at=NULL`).
- **`notify`** stamps `provider_message_id` (best-effort) immediately after an
  accepted send and BEFORE recording the attempt; on a retry re-fire it first
  reads the row and, if `provider_message_id` is set (or status is already
  terminal-sent), it SKIPS the resend and just normalises the row to `'sent'`.
  → true de-dupe for the common "send OK, bookkeeping write lost" case; the
  residual worst case (BOTH the id-stamp AND the record write fail) is bounded to
  ≤ `max_attempts` sends, then `'sent_unconfirmed'` — never an unbounded loop.

The `notify` in_app + WhatsApp inserts and the marketing-consent suppression are
unchanged (still gated by `!isRetry` / consent-before-enqueue).

### Steps

1. Apply migration `0194_notification_retry_cron.sql` (idempotent — `ADD COLUMN
   IF NOT EXISTS`, DROP/ADD the status CHECK, `CREATE OR REPLACE` both RPCs,
   `CREATE INDEX IF NOT EXISTS`, then schedules `bole-notification-retry-every-1m`).
2. Deploy edge fns:
   - `supabase functions deploy notify`  (modified — enqueue→[dedupe-check]→send
     →stamp-provider-id→record_attempt; retries are email-only via `outbox_id`)
   - `supabase functions deploy notification-retry`  (claims the due batch and
     re-fires `notify`)
   - `config.toml` already sets `[functions.notification-retry] verify_jwt = false`.
3. Secrets/Vault: none new. Uses `supabase_url` + `service_role_key` (existing).
4. Verify:
   - `select * from cron.job where jobname = 'bole-notification-retry-every-1m';`
   - Force a transient email failure (or inspect `notification_outbox`): a failed
     send lands `status='failed'` + `next_retry_at`, then flips to `status='sent'`
     within a couple of minutes.
   - **Duplicate-safety check:** pick a row that reached `status='sent'`, note its
     `attempt_count` and `provider_message_id`, and confirm the recipient got the
     email exactly once. `attempt_count` must never exceed `max_attempts` (3).
   - `select status, count(*) from notification_outbox group by 1;` — no row should
     sit in `'sending'`/`'pending'` older than ~5 min (recovery/sweep drains them).
   - `select job_name, last_run_at from cron_heartbeat where job_name='notification-retry';`
5. Post-deploy client cleanup: **none.** (Optional: regenerate
   `apps/web/src/types/db.generated.ts` so it reflects the two new columns — no
   app code reads them, so this is cosmetic and can be batched with any later
   `supabase gen types` run.)

Rollback: `select cron.unschedule('bole-notification-retry-every-1m');` and
re-deploy the previous `notify`. The new columns / widened CHECK are additive and
inert without callers; the RPCs `CREATE OR REPLACE` back to their 0085 bodies if
you re-apply 0085 (or leave the hardened bodies — they are strictly safer).

---

## Item B5 — hr_dashboard_bootstrap(email) RPC  (client hook swap STAGED)

1. Apply migration `0195_hr_dashboard_bootstrap.sql` (SECURITY DEFINER RPC,
   authz-gated to the company's own primary HR email or admin).
2. Secrets/Vault: none.
3. Verify authz first (critical — SECURITY DEFINER bypasses RLS):
   - As HR user A, `select public.hr_dashboard_bootstrap('<A's company email>')`
     returns A's pipeline.
   - As HR user A, `select public.hr_dashboard_bootstrap('<B's company email>')`
     RAISES `forbidden` (42501). Confirm no cross-company leak.
   - Spot-check the JSON matches what the dashboard renders for a known company.
4. **Post-deploy client cleanup (do this ONLY after the RPC is verified live):**
   swap `apps/web/src/routes/dashboard/hr/useHrDashboardData.tsx` to PREFER the
   RPC and FALL BACK to the existing waterfall. Shape returned by the RPC maps
   1:1 onto the hook's mappers:
   `{ company:{id}|null, hms:[{id,profile_id,full_name,job_title,role_count}],
   open_roles:[{id,title,hiring_manager_id}],
   pending:[{id,status,compatibility_score,role:{id,title},talent:{id,profile_id}}],
   scheduled:[{interview_id,match_id,status,scheduled_at,format,meeting_url,meeting_provider,role_title,talent_id}],
   outcomes_pending:int }`.
   Wrap the RPC call in try/catch → on any error (incl. `function does not
   exist`), run the current multi-phase `load()` unchanged. Bump the web gate
   (typecheck+eslint+test:run+build) before merging that hook change.

**Why the hook swap was NOT done in this batch:** the hook is a 5-phase
orchestration with a 20s watchdog, localStorage KPI cache, and derived maps; a
clean PREFER-RPC-with-fallback swap that keeps the tested behaviour byte-identical
needs its own gate run and is safer as a focused follow-up. Migration is safe to
apply now regardless — nothing calls the RPC until the hook opts in.

---

## Item B8 — platform_stats pre-agg counter  (API already backward-compatible)

1. Apply migration `0196_platform_stats_preagg.sql`
   (single-row `platform_stats`, `refresh_platform_stats()`, initial seed, and
   `bole-refresh-platform-stats-30m` cron; anon SELECT granted).
2. Secrets/Vault: none.
3. `apps/web/api/stats.ts` is ALREADY committed to read `platform_stats` first
   and fall back to the live count when the row/table is absent — so it is
   correct both before and after this migration. No redeploy ordering needed.
4. Verify:
   - `select * from public.platform_stats;` → one row with sane counts.
   - `curl https://diamondandjeweler.com/api/stats` → same integers, sub-100ms.
   - `select * from cron.job where jobname = 'bole-refresh-platform-stats-30m';`
5. Post-deploy client cleanup: **none.**

Rollback: `select cron.unschedule('bole-refresh-platform-stats-30m'); drop table
public.platform_stats;` — `/api/stats` auto-falls-back to the live count.

---

## Item B6 — Dead-man switch external alert  (backend only)

1. Apply migration `0197_cron_deadman_external_alert.sql` (redefines
   `cron_deadman_check()` — keeps the existing in-app admin notifications and
   ADDS an optional external webhook post).
2. **Secret/Vault (optional but recommended):** add a Vault secret named
   `deadman_alert_webhook_url` holding a Slack incoming-webhook URL (or any
   endpoint accepting a JSON `{text}` body):
   ```sql
   select vault.create_secret('https://hooks.slack.com/services/XXX/YYY/ZZZ',
                              'deadman_alert_webhook_url');
   ```
   Until this secret exists the function behaves exactly like 0154 (in-app only).
3. Verify:
   - With the secret set, temporarily backdate a heartbeat
     (`update cron_heartbeat set last_run_at = now() - interval '48 hours' where
     job_name='match-expire';`), then `select public.cron_deadman_check();` →
     Slack message arrives AND admins get the in-app notification. Restore the
     heartbeat afterward.
4. Post-deploy client cleanup: **none.**

---

## Item B1 (SAFE half) — server-side life_chart_character trigger

1. Apply migration `0198_life_chart_character_trigger.sql`
   (`compute_life_chart_character(date,text)` pure fn + fill-only
   BEFORE INSERT/UPDATE trigger on `talents` and `hiring_managers`).
2. Secrets/Vault: none new — the trigger decrypts DOB internally using the
   existing `bole_dob_passphrase` Vault secret (same pattern as `encrypt_dob`).
   `decrypt_dob` stays REVOKED (governor §6) — the trigger does NOT call it.
3. Verify (the trigger is FILL-ONLY, so applying it alone changes nothing while
   the client still supplies `life_chart_character`):
   - Insert a talent row WITHOUT `life_chart_character` (character NULL) but WITH
     `gender` + an `encrypt_dob(...)`-produced `date_of_birth_encrypted` → the
     trigger populates the correct code.
   - Insert a talent row WITH a client-supplied `life_chart_character` → the
     trigger leaves it untouched (fill-only). Confirm no change vs. today.
   - Spot-check a few DOBs against `apps/web/src/shared/domain/lifeChart/
     lifeChartCharacter.ts` / its golden test to confirm SQL↔JS parity.
4. **Post-deploy client cleanup (do this ONLY after the trigger is verified live
   AND SQL↔JS parity confirmed):** stop the client from computing/sending
   `life_chart_character` so the server becomes the sole authority (closes H5).
   - `apps/web/src/routes/onboarding/talent/submitTalentOnboarding.ts`
     (`buildTalentInsert`) and the HM equivalent
     (`submitHmOnboarding.ts`) — drop the `life_chart_character` field from the
     insert payload (leave `gender` + encrypted DOB).
   - Then DELETE `apps/web/src/shared/domain/lifeChart/lifeChartCharacter.ts`
     (+ its `.test.ts`) and fix the other importers found by
     `grep -rl getLifeChartCharacter apps/web/src`
     (`AddHmDobModal.tsx`, `matches.ts`, `MatchApprovalPanel.tsx`,
     `postrole/teamCharacters.ts`). Bump the web gate before merging.
   - **Do NOT do this before the trigger is deployed** — deleting the client
     algorithm first would leave new rows with a NULL character until the trigger
     lands.
   - OPTIONAL hardening once the client no longer sends the field: switch the
     trigger from fill-only to authoritative-overwrite for defense-in-depth
     (requires re-confirming SQL↔JS parity across the timezone boundary edge
     cases first — see AUDIT_LOG).

---

## Item B9 — Billplz amount-mismatch: flag + finance alert (money path, §6)

**Problem (review finding, `payment-webhook/index.ts`):** the webhook verifies the
Billplz X-Signature (authenticating every field, INCLUDING `amount`), then asserts
the signed paid amount (sen) equals the purchase's stored price before crediting.
On a **mismatch** it correctly refuses the credit (fail-safe) and returns HTTP 200
so Billplz stops retrying — but the old branch left the row a **silent `pending`**
with no recovery state and no alert. Only tampered/divergent bills reach this today
(no legit flow mismatches — verified), but a genuinely charged-but-not-credited
buyer would be **invisible** to finance. Billplz does not auto-retry, so there is no
second chance to notice.

**Change (already committed on this branch, backward-compatible):** on the mismatch
branch — across all three money paths (`extra_match_purchases`, `point_purchases`,
`consult_bookings`) — the webhook now:

1. **Flags the row** with a durable `amount_mismatch = true` marker (new column,
   migration 0199) so finance can query the charged-but-not-credited rows. Still
   does NOT credit points / deliver a match / flip to paid.
2. **Emits a finance alert** via `reportError` with `code: 'BILLPLZ_AMOUNT_MISMATCH'`,
   the `table`, the `bill_id` / `reference_1` / row id, and the **`expected_sen` +
   `got_sen`** pair (so on-call sees what was charged vs. what it should have cost).
3. Still returns **HTTP 200** (Billplz stops retrying). Idempotent: the marker is
   `true → true`, so a duplicate/replayed mismatch callback re-flags harmlessly and
   never credits.

The marker write is **best-effort**: if `payment-webhook` is deployed BEFORE 0199
is applied, the column is absent and the update errors — the fn swallows it (same
idiom as the 0190 `match_undelivered` marker), and the `reportError` alert is the
guaranteed recovery signal regardless. So the fn is correct either side of 0199.

### Steps

1. Apply migration `0199_payment_amount_mismatch_marker.sql` (idempotent — `ADD
   COLUMN IF NOT EXISTS amount_mismatch boolean not null default false` on the
   three tables + partial `create index if not exists ... where amount_mismatch =
   true`). Purely additive; no backfill; inert until the fn sets it.
2. Deploy edge fn:
   - `supabase functions deploy payment-webhook` (mismatch branch now flags +
     alerts). Safe to deploy before OR after 0199 (best-effort marker); prefer
     applying 0199 first so the very first post-deploy mismatch persists its flag.
3. Secrets/Vault: none new. The alert routes through the existing `reportError`
   sink (`SENTRY_DSN_EDGE` / `EDGE_ERROR_WEBHOOK`) — if neither is set, alerts are a
   no-op (same as every other edge fn), but the DB marker still records the row.
4. Verify:
   - `select id, payment_status, amount_mismatch from public.extra_match_purchases
     where amount_mismatch = true;` — flagged rows are queryable (repeat for
     `point_purchases` and `consult_bookings`).
   - Confirm a flagged row was **never** credited: its `payment_status` stayed
     `pending` (booking `status` stayed `pending`), no `award_points` row, no extra
     match delivered.
   - Confirm the `BILLPLZ_AMOUNT_MISMATCH` alert reached the error sink with
     `expected_sen` / `got_sen`.
5. Post-deploy client cleanup: **none** (optional: regenerate
   `apps/web/src/types/db.generated.ts` for the new `amount_mismatch` columns — no
   app code reads them, cosmetic).

Rollback: drop the three partial indexes + `amount_mismatch` columns (see the
migration header) and re-deploy the previous `payment-webhook`. The branch already
returned 200 on mismatch before this change, so removing the marker only reverts to
the alert-less silent-pending behavior.

---

## Summary table

| Item | Migration(s) | Edge fn deploy | Vault/secret | Post-deploy client cleanup |
|------|--------------|----------------|--------------|-----------------------------|
| B4 | 0194 (outbox schema + RPC hardening **and** cron) | `notify` (mod), `notification-retry` (new) | none | none (optional `db.generated.ts` regen) |
| B5 | 0195 | — | none | swap `useHrDashboardData` to PREFER RPC + fallback |
| B8 | 0196 | — | none | none (`api/stats.ts` already fallback-safe) |
| B6 | 0197 | — | `deadman_alert_webhook_url` (optional) | none |
| B1 | 0198 | — | none (reuses `bole_dob_passphrase`) | drop client `life_chart_character` send + delete `lifeChartCharacter.ts` |
| B9 | 0199 (`amount_mismatch` marker on 3 payment tables) | `payment-webhook` (mod — flag + finance alert on mismatch) | none (uses existing `reportError` sink) | none (optional `db.generated.ts` regen) |
