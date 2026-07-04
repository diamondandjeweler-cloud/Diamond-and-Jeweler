# DNJ / BoLe — STATUS (single source of truth)

> This file supersedes the audit/roadmap doc sprawl (~281 KB across 12 docs). If any
> other doc disagrees with this one, **this one wins.** Keep it SHORT — one screen.

## The only two numbers that matter right now

- **Pipeline alive?** ✅ **YES** — verified live 2026-07-04: `GET /api/health` → 200,
  `{"pipeline":{"healthy":true,"last_heartbeat_age_seconds":38,"recent_done":0}}`. The Vault
  `service_role_key` was rotated and the ~27-day outage older docs describe is **resolved**.
  It's healthy but **idle** — `recent_done:0` simply because there are no roles to match yet.
- **Real users:** **0** — verified `GET /api/stats` → `{"talents":0,"companies":0}`. Pre-launch.

**Operating rule:** the blocker is no longer code or ops — the pipeline runs and is monitorable.
The blocker is **getting the first real users** + closing the legal/product gates below.
Do not merge refactors / UI polish while users = 0; put that energy into launch.

## Owner blockers — what actually still gates the pilot

1. ✅ **DONE — Vault `service_role_key` rotated / pipeline revived.** Verified live: heartbeat is
   fresh (age 38s), so the crons (incl. migration `0151`) are applied and running in prod. The
   older docs' "pipeline dead / prod stuck at 0121" is **stale** — prod has advanced past it.
2. 🟠 **Confirm an external monitor is pointed at `/api/health`** (UptimeRobot, 5 min). The endpoint
   works and returns 503 on failure, but the in-DB dead-man check goes unseen when everyone's
   logged out — an external monitor is the only off-platform alarm. *(Unverifiable from here — confirm.)*
3. 🟠 **Reconcile prod `schema_migrations` + verify the `CONCURRENTLY` pre-filter indexes** exist in
   prod `pg_indexes` (run `supabase/post_deploy/0001`; if `0074`'s in-txn indexes never applied, the
   matcher seq-scans at scale). Then flip the CI drift gate to blocking. Exact prod version is
   unverified from here — but `db push` stays unsafe until reconciled.
4. 🔴 **Lawyer packet** (one email): (a) the DOB/race/religion matching signal — PDPA sensitive-data
   + hiring-discrimination exposure; (b) the hiring consent PDPA-waiver (Contracts Act §24);
   (c) the ToS user-content licence gap. (`PRELAUNCH_BLOCKED_ITEMS.md`) **This is now the top gate.**
5. 🟠 **Pick ONE monetization model for the pilot.** `/pricing` sells "free for talent +
   enterprise contact-us," but the code ships a full Diamond Points economy (8+ paid surfaces).
   Park points behind a flag, or commit to it — don't launch both.
6. 🟢 **Get the first 10–50 real users.** The pipeline runs and is idle-healthy; the only thing it's
   missing is roles and talent. This — not more code — is the real work now.

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
- **`createClient<Database>` is NOT a quick win** (attempted 2026-07-04, reverted): the generic
  breaks all `src/routes/restaurant/*` because the restaurant tables aren't in `db.generated.ts`,
  and it slows `tsc` past a 2-min timeout. Needs restaurant tables in the generated types (or the
  restaurant extraction) first, then per-call cleanup — a real refactor, not a one-liner.
- **The secret vocabulary ships in the client bundle** (`lib/orgChartSanitiser.ts` regex map
  `[/bazi/gi, 'temperament pattern']` → visible in `dist/assets/OrgChartDetail-*.js`). Because of
  this, `qa/scripts/01-bazi-secrecy.mjs` cannot be a blocking CI gate (it correctly flags the
  sanitiser's own protective regex). The real fix is moving sanitisation server-side (moat
  decision #4) so the vocabulary never reaches the browser.

## Recent changes (2026-07-04 session)

- `ci(secrecy)`: locale JSON (en/ms/zh) now scanned for forbidden terms — `37ff57b`.
- `refactor(types)`: removed the orphaned `Database` type — `a3d987c`.

_Last updated: 2026-07-04._
