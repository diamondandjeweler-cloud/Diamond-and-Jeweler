# DNJ / BoLe — STATUS (single source of truth)

> This file supersedes the audit/roadmap doc sprawl (~281 KB across 12 docs). If any
> other doc disagrees with this one, **this one wins.** Keep it SHORT — one screen.

## The only two numbers that matter right now

- **Pipeline alive?** ❌ **NO** — the async match backbone has been dead since ~2026-05-30
  (a rotated `service_role_key` was never updated in Vault → every cron→edge call 403s).
  `curl https://diamondandjeweler.com/api/health` returns **503** until the key is rotated.
- **Real users who completed a match this week:** **0** (pre-launch).

**Operating rule:** do not merge refactors / UI polish while the pipeline is dead and users = 0.
Fix those two things first. Everything else is secondary.

## Owner-only blockers — gate everything (~30 min of work + one lawyer email)

1. 🔴 **Rotate the Vault `service_role_key`** → revives the whole pipeline. (`OWNER_ACTIONS.md` P0)
2. 🔴 **Deploy the backend**: `supabase functions deploy` + apply/verify migrations `0163–0169`;
   run `supabase/post_deploy/0001` (the `CONCURRENTLY` pre-filter indexes) and confirm they
   exist in prod `pg_indexes` — if `0074`'s in-txn indexes never applied, the matcher seq-scans.
3. 🔴 **Point a free external monitor at `/api/health`** (UptimeRobot, 5 min) — this is the *only*
   off-platform outage alarm; the in-DB dead-man check goes unseen when everyone's logged out
   (that's how the last outage stayed dark for a month).
4. 🟠 **Reconcile prod `schema_migrations`** (prod ~`0121` vs repo `0169`; ~57 unrecorded) via
   `scripts/check-migration-drift.mjs` + the `INSERT` in `OWNER_ACTIONS.md:53`, **then** flip the
   CI drift gate to blocking. Until this is done, `supabase db push` is unsafe (would re-apply ~57).
5. 🟠 **Lawyer packet** (one email): (a) the DOB/race/religion matching signal — PDPA sensitive-data
   + hiring-discrimination exposure; (b) the hiring consent PDPA-waiver (Contracts Act §24);
   (c) the ToS user-content licence gap. (`PRELAUNCH_BLOCKED_ITEMS.md`)
6. 🟠 **Pick ONE monetization model for the pilot.** `/pricing` sells "free for talent +
   enterprise contact-us," but the code ships a full Diamond Points economy (8+ paid surfaces).
   Park points behind a flag, or commit to it — don't launch both.

## Source of truth for the system

- **Architecture:** `docs/ARCHITECTURE.md` (accurate as of 2026-06-27).
- **Historical only:** `AUDIT*`, `ROAD_TO_A_PLUS`, `ROAD_TO_95`, `SCALE_TO_MILLIONS`,
  `PARTITIONING_RUNBOOK`, `SCALABILITY` are dated snapshots the code has **moved past**
  (god-components decomposed, matcher N+1 collapsed, 5/6 money bugs fixed, repository seam done,
  secrecy leaks closed). Do **not** treat them as current or re-audit against them.

## Open engineering items (NOT owner-gated) — do AFTER the pilot, not before

- Flip `rls_deny.sql` to blocking in CI (needs one observed-green `supabase db reset` run first).
- Wire `cron_deadman_check` to off-platform escalation (notify/Resend), not just an in-DB row.
- ToyyibPay consult callback is dead (401'd before it runs) — wire a real `toyyibpay-webhook`
  or delete it; consults are a parking candidate anyway.
- Parameterize `createClient<Database>` so table reads are compile-checked (untyped today).

## Recent changes (2026-07-04 session)

- `ci(secrecy)`: locale JSON (en/ms/zh) now scanned for forbidden terms — `37ff57b`.
- `refactor(types)`: removed the orphaned `Database` type — `a3d987c`.

_Last updated: 2026-07-04._
