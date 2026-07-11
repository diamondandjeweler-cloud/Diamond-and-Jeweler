# Diamond & Jeweler — System Architecture

_The system-design reference for DNJ (package `bole-web`). Written as the "senior engineer documents the production architecture" deliverable. Grounded in the live system as of 2026-06-27. Companion to [AUDIT_2026-06-27.md](./AUDIT_2026-06-27.md) (quality grades) and [ROAD_TO_A_PLUS.md](./ROAD_TO_A_PLUS.md) (roadmap)._

---

## 1. What it is

A two-sided AI-curated recruitment marketplace for Malaysia. **Talent** ↔ **hiring_manager / hr_admin**, matched by an AI scoring engine that returns a few high-signal candidates instead of a CV pile. Monetised via **Diamond Points** + paid extras (urgent search, extra match) through **Billplz / ToyyibPay**. PDPA-compliant (encrypted DOB, data-subject requests). A separate, flag-gated **Restaurant OS** module shares the database.

**Stack:** React 18 + Vite 5 + TypeScript SPA · Supabase (Postgres 15, Auth, Storage, PostgREST, Realtime) · 48 Deno edge functions · pg_cron + pg_net for async work · Vercel (SIN1 edge) · Supabase Singapore region.

---

## 2. System architecture (the three planes)

```
                          ┌─────────────────────────────────────────────┐
   Browser (SPA)          │  Vercel — SIN1 edge                          │
   React 18 + Vite        │                                              │
   ──────────────         │   • Static SPA (immutable hashed assets, SW) │
   useSession (zustand)   │   • middleware.ts  → rate-limit /api/*,      │
   supabase-js  ──────────┼─────  edge /admin JWT gate, bot OG inject    │
        │  │              │   • /api/* edge fns (health, stats,          │
        │  │              │      set-auth-cookie, webhooks/*)            │
        │  │              └───────────────┬──────────────────────────────┘
        │  │ PostgREST (RLS)              │  fetch
        │  │ Realtime (RLS)               ▼
        │  └────────────────►  ┌─────────────────────────────────────────┐
        │   supabase.rpc()     │  Supabase — Singapore                    │
        │   functions.invoke() │                                          │
        │                      │  Postgres 15                             │
        │                      │   • 62 tables, RLS = the authz boundary  │
        │                      │   • RPCs (SECURITY DEFINER) for hot/admin │
        │                      │   • pg_cron + pg_net → edge (async work) │
        │                      │  Auth (JWT, OAuth, TOTP)  Storage (IC/CV) │
        │                      └───────────────┬──────────────────────────┘
        │                                      │ pg_net.http_post (Bearer service_role)
        └──────────── functions.invoke ───────►│
                                               ▼
                              ┌─────────────────────────────────────────┐
                              │  48 Deno Edge Functions                  │
                              │   • match-generate / process-match-queue │
                              │   • _shared/match-core.ts (the scorer)   │
                              │   • payment-webhook, award-points, …     │
                              │   • LLM extractors (chat/profile/role)   │
                              └─────────────────────────────────────────┘
```

**Three load-bearing decisions:**
1. **RLS is the authorization boundary.** Row visibility is enforced in Postgres, not the app. Realtime delivery is RLS-gated too. SECURITY DEFINER RPCs are the controlled escape hatch (admin reads, hot paths) — each gates on `is_admin()` / participant checks at entry.
2. **Matching is async + queue-drained.** `match-generate` (or a queued role) runs the shared scorer; `process-match-queue` drains `match_queue` every minute via pg_cron→pg_net→edge. The expensive LLM "pitch" is decoupled (insert first, UPDATE the summary after) so it never blocks persistence.
3. **The edge is thin; Postgres is the core.** Candidate pre-filtering is a set-based SQL RPC (`get_match_candidates`, LIMIT 500); the edge orchestrates and scores. No app server — Vercel functions + Supabase only.

---

## 3. File structure

```
apps/web/                      # the SPA (package "bole-web") — NOT a monorepo
  index.html                   # pre-paint theme script (CSP-hashed)
  middleware.ts                # Vercel edge: rate-limit + /admin gate + bot OG
  vercel.json                  # headers, strict CSP, SPA rewrites, cache rules
  api/                         # Vercel edge functions (8)
    health.ts  stats.ts  set-auth-cookie.ts  og.tsx
    webhooks/{foodpanda,grab,shopee}.ts
  src/
    routes/    (94)            # pages, by feature: auth/ dashboard/ onboarding/
                               #   legal/ blog/ restaurant/ dashboard/admin/
    components/ (32)           # ui.tsx design system + Skeleton/EmptyState/…
    lib/       (33)            # supabase client, api.ts (repo seam), format,
                               #   prefetch, dashboardCache, useDarkMode, i18n
    state/                     # useSession.ts (zustand auth/session store)
    data/      (6)             # restaurant store/types/context (clean sub-module)
    types/db.ts                # shared domain types (single source of truth)
    locales/                   # en / ms / zh (i18n at key parity)

supabase/
  functions/                   # 48 Deno edge functions
    _shared/                   #   match-core.ts (scorer), auth.ts, supabase.ts,
                               #   cors.ts, audit.ts, match-reasoning.ts
    match-generate/  process-match-queue/  match-expire/  payment-webhook/  …
  migrations/                  # 217 SQL files (0001 → 0193)
  tests/                       # rls_deny.sql, column_isolation.sql (CI gates)
  config.toml                  # per-function verify_jwt pins

docs/                          # AUDIT, ROAD_TO_A_PLUS, OWNER_ACTIONS, runbooks
scripts/                       # check-migration-drift.mjs, build helpers
.github/workflows/ci.yml       # typecheck/lint/test/build + db reset + RLS gates
```

---

## 4. Database schema (core)

62 tables. The **recruitment core** (~18):

```
profiles ──1:1── talents          (talent profile, ic_path, derived_tags, DOB enc)
   │     └─1:1── hiring_managers ──N:1── companies   (verified, size, industry)
   │                   │
   │                 roles ──1:N── matches ──N:1── talents
   │                              (status FSM, scores, internal_reasoning,
   │                               life_chart_score, public_reasoning)
   │                                 │
   │                       ├── match_queue      (FOR UPDATE SKIP LOCKED, retry cap)
   │                       ├── match_history     (audit of generation/expiry)
   │                       ├── match_feedback    (ratings, hired)
   │                       ├── interview_rounds  (hm_notes private)
   │                       └── interview_proposals (3 slots)
   │
   ├── point_purchases / extra_match_purchases   (Billplz/ToyyibPay, idempotent CAS)
   ├── consult_bookings        (ToyyibPay)
   ├── notifications           (in-app)
   └── audit_log               (security/admin actions)

system_config   (~27 scoring weights + earn rates + feature flags)
waitlist        (pre-launch capture)
cron_heartbeat / admin_kpi_cache / mv_admin_kpis   (ops + KPI cache)
```

Plus the **Restaurant OS** module (~33 tables: `branch`, `menu_item`, `orders`, `reservation`, `kitchen_ticket`, e-invoice, etc.) — feature-flagged off (`VITE_ENABLE_RESTAURANT`), frontend fully decoupled (`src/data/`), but **co-located in the `public` schema** (a deliberate, documented constraint — see audit; isolation into `restaurant.*` is deferred).

**Key column-security facts** (the system's most-audited surface):
- `talents.ic_path` (NRIC/passport path) — revoked from `authenticated`; served only via signed URLs / edge.
- `matches.internal_reasoning` + `life_chart_score` (scoring IP) — revoked from `authenticated`; admins read via SECURITY DEFINER RPCs.
- `*.date_of_birth_encrypted` — pgcrypto; `decrypt_dob` not executable by `authenticated`.
- Enforced by a **blocking** `column_isolation.sql` CI gate + the `rls_deny.sql` invariant suite.

---

## 5. API surface

**A. PostgREST (supabase-js) — the default data plane.** Direct table reads/writes, RLS-scoped. ~149 call sites (the audit flags routing these through a data layer).

**B. SECURITY DEFINER RPCs** (`supabase.rpc(...)`) — hot paths + admin + anything needing controlled privilege:
- Matching: `get_match_candidates`, `get_life_chart_bucket`, `get_year_luck_stage`, `get_match_profile_previews`, `compare_nn_concerns`
- Admin: `get_admin_matches`, `get_pending_match_reasoning`, `get_admin_kpis_fast`, `refresh_admin_kpis_mv`
- Money/points: `award_points`
- Ops: `pipeline_health`

**C. Deno edge functions** (`functions.invoke` / pg_net / webhooks) — 48 total, by domain:
| Domain | Functions |
|---|---|
| Matching | `match-generate`, `process-match-queue`, `match-expire`, `admin-force-match`, `urgent-priority-search` |
| Money | `payment-webhook`, `buy-points`, `award-points`, `redeem-points`, `unlock-extra-match`, `admin-refund`, `init-consult-booking` |
| LLM extract | `extract-talent-profile`, `extract-hm-profile`, `extract-non-negotiables`, `extract-deal-breakers`, `extract-feedback-tags`, `draft-role-description`, `chat-onboard`, `chat-support`, `moderate-role`, `bazi-score` |
| Lifecycle | `invite-hm`, `link-hm`, `interview-action`, `submit-feedback`, `switch-account-type`, `admin-change-role`, `create-meeting`, `enqueue-talent-extraction`, `retry-stuck-extractions` |
| PDPA/notify | `dsr-export`, `dsr-apply-correction`, `data-retention`, `notify`, `send-push-notification`, `resend-webhook` |
| Growth | `proactive-job-push`, `stale-loop-nudge`, `monthly-fortune`, `submit-monthly-boost`, `process-referral` |
| Restaurant | `auto-po`, `reservation-reminder`, `myinvois-*` |

**D. Vercel `/api`** (8): `health` (deep liveness → 503 when pipeline dead), `stats` (public counts), `set-auth-cookie` (HttpOnly sb-jwt for the edge admin gate), `og` (social cards), `webhooks/{foodpanda,grab,shopee}`.

---

## 6. UI architecture

- **Routing:** React Router, **every route lazy-loaded** (`React.lazy` + Suspense, `RouteSkeleton` layout-matched fallback → no CLS). Vendor `manualChunks`, role-aware prefetch, injectManifest service worker (cache-first hashed assets).
- **Design system:** `components/ui.tsx` — Button/Card/Field/Input/Select/Alert/Badge/EmptyState/Stat with `forwardRef`, `aria-busy`, `useId`-linked labels, disable-on-loading. A 4-variant `Skeleton` family (all `role="status"`). One auto-recovering `ErrorBoundary` (stale-chunk reload + Sentry hook).
- **State & data:** `useSession` (zustand) is the single auth/session source (token-refresh race lock, visibility re-warm, banned-user gate); per-view data via `useEffect` + supabase-js (the audit recommends a `useAsyncData` hook + repository layer to retire the 67 raw fetch loops); `dashboardCache` (sessionStorage, PDPA-aware) hydrates KPIs instantly.
- **a11y/i18n:** skip-link, ARIA landmarks, `eslint-plugin-jsx-a11y`, axe Playwright suite; i18next en/ms/zh at key parity; dark mode (pre-paint, FOUC-free) themed on shell + marketing (dashboards pending).

---

## 7. Data flow — one match generation

```
HM posts/edits role  ──►  roles row (RLS: HM owns it)
        │
        ▼  (trigger / cron / explicit invoke)
match_queue enqueue  ──►  process-match-queue (pg_cron 1m, pg_net→edge, service_role)
        │                         │  FOR UPDATE SKIP LOCKED, retry cap 3
        ▼                         ▼
match-core.matchForRole(roleId):
   1. load role + HM (decrypt HM DOB once)
   2. get_match_candidates(role)  → ≤500 pre-filtered candidates (set-based SQL)
   3. batch system_config weights (1 query)               [W1b]
   4. per candidate: scoreTalent()
        • memoized life-chart / year-luck RPCs            [W1a]
        • age / peak / culture / feedback / ghost scorers
        • compare_nn_concerns only if free_text atoms     [W1c]
   5. insert matches (status='generated', summary=null)
   6. async UPDATE public-reasoning pitch (LLM, off the insert path)
        │
        ▼
HM dashboard (Realtime, RLS-scoped channel) ──► candidate cards
   get_match_profile_previews(ids[])  (1 round-trip)       [W1c]
        │
        ▼  HM invites → interview_proposals → interview_rounds → match_feedback → hired
```

Money path (parallel): purchase → Billplz/ToyyibPay → `payment-webhook` (signature verify, atomic CAS idempotency) → `award_points` (idempotency key).

---

## 8. Scale properties & known constraints

**Scales cleanly:** static SPA on CDN (hashed assets + SW), set-based + LIMIT-capped candidate filtering (won't degrade with talent-pool growth — the key marketplace property), RLS plan-cached (`(select auth.uid())`), idempotent money paths, queue-drained generation (horizontally scalable by adding workers).

**Bounded constraints (tracked in the audit/roadmap):**
- **Operational SPOF (resolved 2026-07-04):** the async backbone depends on a Vault `service_role_key`; a key rotation left it stale → pipeline dead 27 days. Fixed forward with `/api/health` (external-monitorable) — see [OWNER_ACTIONS.md](./OWNER_ACTIONS.md).
- **Single-region** Supabase + Vercel (correct for a Malaysia-first pilot; pin + document before scaling).
- **Edge rate-limiter is per-isolate** in-memory (best-effort, not a hard global quota).
- **Deploy is split-brained** (frontend auto-deploys; migrations + edge fns by hand) → `schema_migrations` drift (detector shipped).
- **Maintainability debt:** no data-access layer (149 direct calls), three 1.3–1.6k-LOC god-components, 1178-line `matchForRole` — the Clean-Arch refactor backlog.
