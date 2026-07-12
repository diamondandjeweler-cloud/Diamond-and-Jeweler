# Staged Deploys — WAVE-B (Batch 6)

Ordered manifest the **owner** follows to land the Wave-B backend changes.
Everything here was authored branch-side but **NOT applied** (migrations, edge-fn
deploys, secrets, and cron are HUMAN-GATED — AGENTS.md §4.7/§8).

**Governing safety property:** every `apps/web` change already committed on this
branch is BACKWARD-COMPATIBLE — it works correctly whether or not these
migrations/edge-fns are applied. So the branch (and its Vercel preview) is safe
to merge before the owner applies anything below. Applying each item is a pure,
additive improvement.

Migration numbers are the next-free block after `0193`: **0194–0198**.

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

**Deploy order matters:** edge fns FIRST, then the migration (the cron in 0194
calls the `notification-retry` fn — deploy it before scheduling).

1. Deploy edge fns:
   - `supabase functions deploy notify`  (modified — enqueue→send→record_attempt;
     retries are email-only via the new `outbox_id` field)
   - `supabase functions deploy notification-retry`  (NEW — claims the due batch
     and re-fires `notify`)
   - `config.toml` already sets `[functions.notification-retry] verify_jwt = false`.
2. Apply migration `0194_notification_retry_cron.sql`
   (schedules `bole-notification-retry-every-1m`).
3. Secrets/Vault: none new. Uses `supabase_url` + `service_role_key` (existing).
4. Verify:
   - `select * from cron.job where jobname = 'bole-notification-retry-every-1m';`
   - Force a transient email failure (or inspect `notification_outbox`): a failed
     send should land `status='failed'` with `next_retry_at` set, then flip to
     `status='sent'` within a couple of minutes.
   - `select job_name, last_run_at from cron_heartbeat where job_name='notification-retry';`
5. Post-deploy client cleanup: **none.**

Rollback: `select cron.unschedule('bole-notification-retry-every-1m');` and
re-deploy the previous `notify`. The outbox table/RPCs (0085) stay; they are inert
without callers.

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

## Summary table

| Item | Migration(s) | Edge fn deploy | Vault/secret | Post-deploy client cleanup |
|------|--------------|----------------|--------------|-----------------------------|
| B4 | 0194 | `notify` (mod), `notification-retry` (new) | none | none |
| B5 | 0195 | — | none | swap `useHrDashboardData` to PREFER RPC + fallback |
| B8 | 0196 | — | none | none (`api/stats.ts` already fallback-safe) |
| B6 | 0197 | — | `deadman_alert_webhook_url` (optional) | none |
| B1 | 0198 | — | none (reuses `bole_dob_passphrase`) | drop client `life_chart_character` send + delete `lifeChartCharacter.ts` |
