# DNJ / BoLe — STATUS (single source of truth)

> **State as of 2026-07-12**, live tip `c9c5fef` (branch `feat/path-to-100`). For anything
> newer, check `git log` and `docs/ARCHITECTURE.md`. The owner-only path-to-100 list now lives
> in **`docs/OWNER_ONEPAGER_PATH_TO_100.md`** — this file is the engineering-state snapshot.

> This file supersedes the audit/roadmap doc sprawl (~281 KB across 12 docs). If any
> other doc disagrees with this one, **this one wins.** Keep it SHORT — one screen.

## The only two numbers that matter right now

- **Pipeline alive?** ✅ **YES** — the Vault `service_role_key` was rotated and `GET /api/health`
  returned 200 with a fresh heartbeat (last verified live 2026-07-04). The ~27-day outage the older
  docs describe is **resolved**. Healthy but **idle** — no roles to match yet. *(Re-confirm via the
  external uptime monitor once it's wired — see blockers.)*
- **Real users:** **0** — pre-launch (`GET /api/stats` → `{"talents":0,"companies":0}` at last check).

**Operating rule:** the blocker is no longer code or ops — the pipeline runs and is monitorable.
The blocker is **getting the first real users** + closing the legal/product gates below. The
"no refactors while users = 0" rule was overridden by the 07-10 UI-stabilization work; whether to
reinstate it is an open decision (`docs/decisions/`, and the one-pager).

## Owner blockers — what actually gates the pilot (2026-07-12)

Full owner list with point values in **`docs/OWNER_ONEPAGER_PATH_TO_100.md`**. The gating subset:

1. 🔴 **Lawyer packet** (the #1 gate, ~15 pts): email `docs/legal/LAWYER_PACKET.md` to Malaysian
   counsel (cover email drafted at `docs/legal/LAWYER_EMAIL_DRAFT.md`). Need back: yes/no + redlines
   on (a) DOB/race/religion as a matching signal, (b) the PDPA-waiver clause, (c) the ToS
   content-licence gap. (`docs/PRELAUNCH_BLOCKED_ITEMS.md`)
2. 🔴 **Pick ONE monetization model** (~12 pts): `/pricing` sells free + "contact us" while the code
   ships a full Diamond Points economy. Park one behind a flag or align the copy. Decision brief:
   `docs/decisions/0002-monetization-model.md`.
3. 🟠 **Enable Vercel Required Checks** (`web`, `db-apply`, `security`, `e2e`). This is *exactly* how
   the 2026-07-10 white-screen reached prod (see `docs/postmortems/2026-07-10-vendor-chunk-white-screen.md`).
   Pairs with the Wave-A chunk-integrity guard — the guard is toothless until this toggle makes it block.
4. 🟠 **Point an uptime monitor at `/api/health`** (UptimeRobot / cron-job.org, 5 min, alert on HTTP
   503). `/api/health` already 503s on a dead pipeline; nothing off-platform watches it — the 07-10
   outage was caught by hand.
5. 🟠 **Set `SENTRY_DSN_EDGE`** on project `sfnrpbsdscikpmbhrzub` + redeploy edge fns — 44 edge-fn
   error sites are wired to it and are silently inert until set.
6. 🟠 **Set the Billplz webhook signature secret** — `payment-webhook` is fail-closed (safe) but can't
   verify live callbacks without it.
7. 🟠 **Reconcile prod `schema_migrations`** — repo is now at **0193**; prod's ledger is ~40 behind
   (migrations applied out-of-band via Management API/dashboard). `supabase db push` would mis-fire
   until reconciled; then flip the CI drift gate to blocking. Also verify the `CONCURRENTLY`
   pre-filter indexes exist in prod (`supabase/post_deploy/0001`).
8. 🟢 **Get the first 10–50 real users.** The pipeline is idle-healthy; it's missing roles and talent,
   not code.

## Source of truth for the system

- **Architecture (current):** `docs/ARCHITECTURE.md` (accurate as of 2026-06-27).
- **Architecture (target/strangler realized + gaps):** `docs/ARCHITECTURE_TARGET.md`.
- **Historical only:** `AUDIT*`, `ROAD_TO_A_PLUS`, `ROAD_TO_95`, `SCALE_TO_MILLIONS`,
  `PARTITIONING_RUNBOOK`, `SCALABILITY` are dated snapshots the code has **moved past** (god-components
  decomposed, matcher N+1 collapsed, money bugs fixed, repository seam done, secrecy leaks closed). Do
  **not** treat them as current or re-audit against them.

## Open engineering items (NOT owner-gated) — do AFTER the pilot, not before

- Flip `rls_deny.sql` to blocking in CI (needs one observed-green `supabase db reset` run first).
- Wire `cron_deadman_check` to off-platform escalation (notify/Resend), not just an in-DB row.
- Storybook-axe as a blocking CI gate + a chunk-integrity build guard (both in the Wave-A CI-Guards batch).
- ToyyibPay consult callback is dead (401'd before it runs) — wire a real `toyyibpay-webhook` or delete it.
- **`createClient<Database>` is NOT a quick win** (attempted 2026-07-04, reverted): the generic breaks
  all `src/routes/restaurant/*` (restaurant tables aren't in `db.generated.ts`) and slows `tsc` past a
  2-min timeout. Needs the restaurant tables generated (or the restaurant extraction) first.
- **The secret vocabulary ships in the client bundle** (`lib/orgChartSanitiser.ts` regex map is visible
  in `dist/assets/OrgChartDetail-*.js`), so `qa/scripts/01-bazi-secrecy.mjs` can't be a blocking gate.
  Real fix is moving sanitisation server-side (moat decision #4 / the staged H5 life-chart fix).

## Launch-QA snapshot — last run against prod 2026-07-05

Ran the `qa/` launch harness (read-only + authz subset; skipped active write-probes `03`/`14` + LLM
checks). Result: **10/14 clean, authz boundary verified holding in prod.**

- ✅ **Authz holds:** RLS on 16 tables + anon blocked (`02`), 4/4 forged JWTs rejected (`04`), 33 testers
  invisible to anon (`11`), no plaintext DOB in bundle or API (`13`). TLS/headers, SSL/DNS, SEO, backups
  (7 retained), and 108 email templates all clean.
- ⚠️ **`12-dsr-tenant-isolation` false FAIL** — the probe sends `apikey`+`Authorization` together, which
  the current Supabase gateway rejects. Stale QA harness (`qa/lib/http.mjs`), not a DSR vuln.
- ⚠️ **`01-bazi-secrecy` FAILs on the client-bundle sanitiser** (see open items) — not a leak.

## Recent changes

**2026-07-12:** `fix(security)` PR#36 — sanitize consent markdown + an eslint guard banning raw
`dangerouslySetInnerHTML` — `66e73c3` (merge `c9c5fef`).

**2026-07-11:** matcher diversity v2 + salary-null handling (`0191`); faithful points-counter reconcile
+ realtime `hm_id` spoof guard (`0192`/`0193`, `c008790`); **MYT timezone cluster** — day-inclusive promo
boundaries, overnight window, tax/e-invoice MYT day-bucketing (`eac1464`) + PIN uniqueness / a11y
(`8f186a7`); **i18n parity** — Kiosk/Referrals localized, ms/zh at key parity (`beb0979`);
`fix(security,money)` H1 extra-match gate + delivery HMAC + loyalty split-pay (`28984c9`).

**2026-07-10:** 🔴 prod white-screen outage + hotfix — Radix transitive deps routed into the wrong vendor
chunk (`b91bea7`, PR#31). Postmortem: `docs/postmortems/2026-07-10-vendor-chunk-white-screen.md`.

**2026-06-30:** `feat(observability)` structured logger modules (web + edge) — `apps/web/src/lib/logger.ts`
+ `supabase/functions/_shared/logger.ts` — `fb480e9`.

_Last updated: 2026-07-12._
