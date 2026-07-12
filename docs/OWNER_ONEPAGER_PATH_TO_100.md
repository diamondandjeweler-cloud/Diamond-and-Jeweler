# Owner One-Pager — Path to 100% (Wave C + D)

> The engineering waves (A = ship-now, B = staged-for-your-deploy) close ~135 of the 222 remaining
> audit points and lift the mean from **77.8 → ~91**. The **last ~9 points to 100 are owner-only** —
> legal, product decisions, secrets, and dashboard toggles that no agent can perform. This is that list.
> _Generated 2026-07-12 against live tip `c9c5fef`._

---

## 🔴 The two things that actually block a real pilot

Everything else is quality/scale hardening. A pilot cannot open until these are decided:

### 1. Lawyer sign-off (worth 15 pts, the #1 gate)
- **Do:** email `docs/legal/LAWYER_PACKET.md` to Malaysian counsel. A ready-to-send cover email is
  drafted at `docs/legal/LAWYER_EMAIL_DRAFT.md` — attach the packet, paste the email, send.
- **You need back:** yes/no + redlines on (1) DOB/race/religion as a matching signal, (2) delete the
  PDPA-waiver clause, (3) the ToS content-licence wording.
- **Then:** engineering implements whichever fixes counsel requires (all three are quick, pre-scoped).

### 2. Monetization model for the pilot (worth 12 pts)
- **Do:** pick ONE — free + "contact us", or the Diamond Points economy. Both currently ship at once
  (`/pricing` sells free+enterprise while the code runs a full points economy). Decision brief:
  `docs/decisions/0002-monetization-model.md`.
- **Then:** engineering gates the losing path (one flag) or aligns the pricing copy.

---

## 🟠 Owner dashboard / secret actions (~30 minutes total)

Each is a few clicks. None require code.

| # | Action | Where | Why it matters | Pts |
|---|--------|-------|----------------|-----|
| 3 | **Enable Required Checks** so red CI blocks a prod promotion | Vercel → project → Git → Required Checks: mark `web`, `db-apply`, `security`, `e2e` | This is *exactly* how the 2026-07-10 white-screen reached prod. Pairs with the new chunk-integrity guard (Wave A) — the guard is toothless until this toggle makes it block. | 4 |
| 4 | **Point an uptime monitor at `/api/health`** | UptimeRobot / cron-job.org / Better Uptime — 5-min interval, alert after 2–3 consecutive fails (esp. HTTP 503) | The 07-10 outage was caught by hand. `/api/health` already returns 503 on a dead pipeline; nothing watches it. | 8 |
| 5 | **Set `SENTRY_DSN_EDGE` secret** + redeploy edge fns | `supabase secrets set SENTRY_DSN_EDGE=<dsn>` on project `sfnrpbsdscikpmbhrzub` | 44 edge-fn error sites are wired to it and are silently inert until set. | 4 |
| 6 | **Set the Billplz webhook signature secret** | Billplz dashboard → webhook settings | Payment webhook can't verify authenticity without it. | 2 |
| 7 | **Install a shared KV store** (Upstash/Vercel KV) | Vercel Marketplace → install → auto-injects env → redeploy | The `/api` rate-limiter is currently in-memory per-isolate (fail-open); it auto-upgrades once a KV URL exists. | 3 |

---

## 🟡 Owner + engineering, sequenced (prod DB & staged deploys)

| # | Action | Detail | Pts |
|---|--------|--------|-----|
| 8 | **Verify prod talent indexes exist** | Run the verify query for `idx_talents_open / salary_min / emp_type`; if missing, `psql -f supabase/post_deploy/0001_concurrently_indexes.sql` (outside a txn). Matcher latency depends on it. | 4 |
| 9 | **Reconcile prod `schema_migrations`** | Prod ledger is ~40 migrations behind the repo (repo now at 0193). Run `SUPABASE_ACCESS_TOKEN=… node scripts/check-migration-drift.mjs`, confirm each was truly applied, insert the missing rows so a future `db push` is safe. Then engineering flips the CI drift gate to blocking. | 4 |
| 10 | **Apply the Wave B staged backend** | Engineering has authored these on this branch but NOT deployed them. Follow `docs/STAGED_DEPLOYS.md` in order — each entry lists the migration file(s), edge fn(s) to deploy, any Vault key, and any post-deploy client cleanup. Includes the **life-chart-server-side (H5)** fix that removes proprietary IP from the client bundle. | — |
| 11 | **Owner smoke-test once on prod** | signup → confirm → post role → verify persisted. No Turnstile-bypass env exists, so a human must do it once. Checklist pre-written in the staged manifest. | 3 |
| 12 | **Certify email verification (F-06)** | Execute the email-verification manual against a real/sandbox inbox (SPF/DKIM, single-use link, reset). | 3 |

---

## ⚪ Blocked until a staging/UAT environment exists (Wave D — +8 pts)

Running these against the prod NANO Supabase risks a 521 outage (it has happened). **Provisioning a
throwaway staging project is the unlock** — that is itself an owner cost decision; engineering has the
scripts ready.

- **Declarative partitioning rehearsal** (audit_log / notification_outbox / match_history) — destructive table rewrite, never in a normal migration.
- **Run the k6 load suite** (`tests/load/*.k6.js`) — scripts committed, never executed; first real traffic is currently the load test.
- **Rehearse the rollback drill** (ROLLBACK_RUNBOOK §8) on a throwaway branch.

---

## Three architecture decisions (no rush; engineering can implement either branch)

- Rescind or reinstate the "no refactors while users = 0" rule (07-10 forced UI stabilization — likely rescind). → `docs/decisions/`
- Restaurant bounded-context split (separate migration stream/repo?) — current isolation is viable.
- Hexagonal ports/adapters — current feature-folder layout is viable.

---

### Bottom line
Engineering can reach **~91/100** on this branch with zero prod risk. The final climb to 100 is
**your** list above — and of it, only items **1 and 2** (lawyer + monetization, 27 pts) actually gate
the pilot. The rest is safety-net hardening you can do in parallel.
