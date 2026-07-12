# Owner Actions — things only you can safely do

_These are blocked on secrets, external services, or product decisions — I won't handle master credentials even under full autonomy. Ordered by impact. **Last re-verified 2026-07-12** against live tip `c9c5fef`._

> **This is the working checklist.** The scored, point-by-point owner path to 100 is in
> **[OWNER_ONEPAGER_PATH_TO_100.md](./OWNER_ONEPAGER_PATH_TO_100.md)** — the two docs are kept in sync;
> the one-pager has the "why it's worth N points" framing, this one has the exact commands.

---

## ✅ DONE — Revive the match pipeline (resolved 2026-07-04)

**Resolved:** the Vault `service_role_key` was rotated and the pipeline was verified live 2026-07-04 — `GET /api/health` → 200 with a fresh heartbeat (see [docs/STATUS.md](./STATUS.md)). Kept as historical reference for how it was fixed.

<details><summary>How it was fixed</summary>

The async backbone was dead ~27 days because the service-role key was rotated without updating the Vault copy, so every cron→edge call returned 403.

1. Supabase Dashboard → **Project Settings → API** → copy the **`service_role`** secret key.
2. SQL Editor: `select vault.update_secret((select id from vault.secrets where name = 'service_role_key'), '<paste key>');`
3. Verify within ~1 min: `select * from public.cron_heartbeat;` has fresh rows, or `curl` `/api/health` → 200.
</details>

---

## 🔴 P0 — The two decisions that actually gate the pilot

Neither is code. Nothing else on this page opens the pilot until these are made.

1. **Lawyer sign-off.** Email `docs/legal/LAWYER_PACKET.md` to Malaysian counsel; a cover email is drafted at `docs/legal/LAWYER_EMAIL_DRAFT.md`. Need back: redlines on (a) DOB/race/religion as a matching signal, (b) the PDPA-waiver clause, (c) the ToS content-licence gap. See [PRELAUNCH_BLOCKED_ITEMS.md](./PRELAUNCH_BLOCKED_ITEMS.md).
2. **Monetization model.** Pick ONE — free + "contact us", or the Diamond Points economy. Both ship at once today. Decision brief: [docs/decisions/0002-monetization-model.md](./decisions/0002-monetization-model.md).

---

## 🟠 P1 — Owner dashboard / secret actions (re-verified 2026-07-12; all still OPEN)

| Item | Where | Status @ 2026-07-12 | Why it matters |
|---|---|---|---|
| **Enable Vercel Required Checks** | Vercel → project → Git → Required Checks: mark `web`, `db-apply`, `security`, `e2e` | 🟠 **Open — top priority.** | This is *exactly* how the 2026-07-10 white-screen reached prod. A red CI must block a prod promotion. Pairs with the Wave-A chunk-integrity guard (toothless until this toggle makes it block). **Also the direct prevention for the `--no-verify` bypass — see below.** |
| **Uptime monitor on `/api/health`** | UptimeRobot / cron-job.org / Better Uptime — 5-min interval, alert after 2–3 consecutive fails (esp. HTTP 503) | 🟠 **Open — unverifiable from here; confirm.** | `/api/health` already returns 503 on a dead pipeline; nothing off-platform watches it. The 07-10 outage was caught by hand. |
| **Set `SENTRY_DSN_EDGE`** + redeploy edge fns | `supabase secrets set SENTRY_DSN_EDGE=<dsn>` on `sfnrpbsdscikpmbhrzub` | 🟠 **Open.** | 44 edge-fn error sites are wired to it and are silently inert until set. (Client-side `VITE_SENTRY_DSN` is a separate Vercel env — see `PRELAUNCH_BLOCKED_ITEMS.md`.) |
| **Billplz webhook signature secret** | Billplz dashboard → webhook settings | 🟠 **Open.** | `payment-webhook` is fail-closed (safe) but can't verify live callbacks without it. |
| **Install a shared KV** (Upstash / Vercel KV) | Vercel Marketplace → install → redeploy | 🟠 **Open (nice-to-have).** | The `/api` rate-limiter is in-memory per-isolate (fail-open); it auto-upgrades once a KV URL exists. |

### ⚠️ Process finding — a `--no-verify` bypass reached the branch

Commit **`28984c9`** (`fix(security,money): H1 extra-match gate + delivery HMAC + loyalty split-pay …`,
2026-07-11) landed **bypassing the lefthook pre-commit gate (`--no-verify`)** — the typecheck/lint that
normally runs before a commit was skipped. Nothing caught it because the gate is only local.

- **Impact this time:** low — the change itself is sound and later batches typecheck clean.
- **Prevention (owner action):** make **PR typecheck a Required check** (the "Enable Vercel Required
  Checks" row above, plus a branch-protection rule on GitHub requiring the `web` job green). Once the
  gate lives server-side, `--no-verify` on a local commit can no longer reach prod. Agents cannot set
  branch protection — this is yours.

---

## 🟡 P2 — Prod DB hygiene (when you next touch the pipeline)

**Migration tracking has drifted.** The repo is now at **0193**; prod's `supabase_migrations.schema_migrations`
records roughly ~40 fewer (migrations applied out-of-band via the Management API / dashboard without updating
the ledger). Run `SUPABASE_ACCESS_TOKEN=… node scripts/check-migration-drift.mjs` to see the exact gap.

- Harmless today (you don't use `db push`), so no rush.
- **Before ever running `supabase db push` against prod:** reconcile by recording the genuinely-applied
  versions in `schema_migrations` (I deliberately did NOT auto-record them — recording a version that
  *isn't* actually applied would make a future push silently skip it).
- Also verify the `CONCURRENTLY` pre-filter indexes exist in prod `pg_indexes` (`supabase/post_deploy/0001`);
  if `0074`'s in-txn indexes never applied, the matcher seq-scans at scale.
- Then flip the CI drift gate to blocking (the existing `db-apply` job only validates a fresh apply, never
  prod-vs-repo).

## 🟡 P2 — Product / config decisions (gate Security A+, not the pilot)

| Item | What's needed | Why |
|---|---|---|
| **Admin MFA** | Decide: require a real TOTP factor for admins even on Google/OAuth login? Today OAuth = blanket AAL2. | Caps Security below A+ until decided. If yes, I wire it + you enroll TOTP. |
| **ToyyibPay consult callback** | It's dead (401s before it runs). Decide: wire server-side verification, or delete the consult path. | Consults are a parking candidate anyway. |

## Notes
- I will not retrieve or write the `service_role` key, Billplz secrets, Sentry DSNs, or any API token — handling master credentials is a hard line regardless of authorization. Everything above that involves a secret is yours to apply; everything else is done autonomously.
- Owner-only path to 100: [OWNER_ONEPAGER_PATH_TO_100.md](./OWNER_ONEPAGER_PATH_TO_100.md). Broader A+ history: [ROAD_TO_A_PLUS.md](./ROAD_TO_A_PLUS.md).
