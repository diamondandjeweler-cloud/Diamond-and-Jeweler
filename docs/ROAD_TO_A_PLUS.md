# Diamond & Jeweler — Road to A+

_Plan to lift every dimension of [AUDIT_2026-06-27.md](./AUDIT_2026-06-27.md) from its current grade to **A+**._
_Status as of 2026-06-27. Each item cites the audit finding (file:line) it closes._

---

## 1. Scorecard — now → target

| Dimension | Now | Target | The gap in one line | Lift size |
|---|:--:|:--:|---|:--:|
| Architecture | B+ | **A+** | Matcher per-candidate RPC fan-out + migration-dup hazard + Restaurant-in-public-schema | M |
| Performance | B- | **A+** | Matching engine ~D: 6–9 RPC/candidate ×500; frontend N+1 + zero memo | L |
| Clean-Arch | C+ | **A+** | No data layer (149 direct calls/59 files) + three 1.3–1.6k-LOC god-files + 1178-LOC matchForRole | XL |
| Frontend-UI | B+ | **A+** | Half-themed dark mode (FOUC), deactivated a11y gate, no Modal primitive, partial i18n | M |
| Security | B | **A+** | Column-isolation test gap (let leak recur 3×) + OAuth-MFA bypass + banned-user gap + ToyyibPay verify | M* |
| DevOps | B | **A+** | Split-brain deploy + drift (repo 0158 / prod ~0121) + advisory RLS gate + dark telemetry | M |
| Debugging | B+ | **A+** | `middleware.ts` bare-Response instead of `next()` + channel leak + match-expire heartbeat | S–M |

`*` Security has a hard ceiling set by **owner/product decisions** (Billplz secret, admin MFA policy, ToyyibPay-vs-disable) — see §5. Everything else is engineering we can drive autonomously.

**Honest sizing:** Clean-Arch (C+, two-plus grades, structural) and Performance (B-, the matching engine) are the heavy lifts. Security/DevOps/Debugging/Frontend are reachable inside one focused sprint each. A+ *across the board* is a multi-wave effort, sequenced so **correctness + security + scale land first** and the big maintainability refactor lands **incrementally, behind existing seams, last**.

---

## Progress log

**Wave 0 — SHIPPED LIVE (2026-06-27, commits f60a861 → 874d5cf):**
- **W5 (Debugging):** documented the `middleware.ts` finding as a verified false-positive (the status-200 path is a pass-through — `/api/stats` returns real JSON through it live; changing it would have *introduced* the break); fixed the HMDashboard realtime channel-leak (synchronous teardown + resubscribe coalescing); guarded `admin-refund` against a thrown Billplz fetch (rolls back to `paid`, v13 live); `match-expire` heartbeats at the top so a mid-run throw can't trip a false dead-man alert (v27 live).
- **W3a (Security):** `0159` flips the default privilege so future migration-created tables are fail-closed on SELECT for `authenticated` (verified live: default ACL now `awdDxtm`, no `r`); added the column-isolation invariant (static + functional matched-HM) the suite was missing.
- **W2a (Security/DevOps):** a **blocking** CI gate (`column_isolation.sql`) on the 3×-recurring leak — fixture-free, validated against the live schema. The fixtured row-suite stays advisory pending a green-reset observation (can't run Docker/`gh` from here).
- **W3b (Security):** banned users are gated out of the SPA (`enforceBan` at both profile-resolve points) + a `/banned` notice page. (Server-side ban enforcement already exists in edge `authenticate()`.)

**Wave 1 — IN PROGRESS (2026-06-27, commit 36764f2):**
- **W1a/W1b (Performance):** matcher N+1 partially collapsed — memoized the STABLE `get_life_chart_bucket`/`get_year_luck_stage` RPCs (per-generation cache, byte-preserving — verified `provolatile='s'`) and batched the 27 `system_config` reads into one `.in()` query (verified `system_config.key` unique). Deployed live to all 6 match-core consumers. **Cannot be runtime-verified until the pipeline below is revived.**

> ### 🔴 P0 discovered — production match pipeline is DEAD (owner action required)
> While verifying W1, found the **entire async match pipeline has been dead ~27 days** (last match `2026-05-30`; `cron_heartbeat` empty). Root cause: the project's **service-role key was rotated ~2026-05-30, but the Vault `service_role_key` secret was never updated** — so every cron→edge call (`process-match-queue` 1m, `match-expire` 6h) returns **403 `forbidden`** (confirmed in `net._http_response`). No new matches generate.
> **FIX (owner — I won't handle the master secret):** Dashboard → Settings → API → copy `service_role` key → SQL: `select vault.update_secret((select id from vault.secrets where name='service_role_key'), '<key>');` → verify `cron_heartbeat` populates + 403s become 200s within ~1 min.
> Also found: `refresh-admin-kpis-mv` cron failing every 2 min ("cannot refresh materialized view"). Both belong to W4 (telemetry / dead-man escalation), which would have surfaced this 27 days ago.

**Also shipped this turn (W4 / ops, commits b55176b, 4439d0c):**
- **`mv_admin_kpis` refresh fixed (0160):** was failing every 2 min (unique index on the constant `((1))` can't support `CONCURRENTLY`), which aborted the whole job and froze ALL admin KPIs. Dropped `CONCURRENTLY` in the cron + RPC. Verified live: cron now `succeeded`.
- **`/api/health` now reflects real pipeline liveness (0161):** returns **503** when the pg_cron heartbeat is stale (or Supabase is unreachable), **200** when alive — backed by `pipeline_health()` (anon-safe, no PII). Verified live: currently 503 (correct — pipeline down). **An external monitor on this URL is the fix for "nobody noticed for 27 days"** → see [OWNER_ACTIONS.md](./OWNER_ACTIONS.md).

**Owner actions (consolidated → [OWNER_ACTIONS.md](./OWNER_ACTIONS.md)):** 🔴 Vault `service_role_key` (revives the pipeline); 🟠 point a free uptime monitor at `/api/health`; 🟡 Billplz secret + admin-MFA decision.

**Deferred / blocked (mine):** flip the *fixtured* RLS suite to blocking (needs an observed green reset run — Docker/`gh` unavailable here).

**W1c — SHIPPED (commit ce5cd87):** short-circuit the per-candidate `compare_nn_concerns` pgvector query when neither side has a free_text atom; batch HMDashboard `loadPreviews` into one `get_match_profile_previews(uuid[])` RPC (0162). Both byte-preserving. **→ matcher N+1 collapse (W1) is now complete** (W1a+W1b+W1c); only the `match-expire` serial-regeneration rework remains (deferred — it's pipeline-blocked + needs runtime verification).

**Persona re-audit deliverables (2026-06-27) — SHIPPED:**
- **Persona 1 (full-stack architect):** [ARCHITECTURE.md](./ARCHITECTURE.md) — system arch, file structure, 62-table schema, full API surface, UI arch, data flow.
- **Persona 10 (DevOps):** [DEPLOYMENT.md](./DEPLOYMENT.md) — deploy architecture, CI/CD, monitoring, prod checklist (Docker/K8s N/A — serverless).
- **Persona 5 (clean-arch refactor) — data-access layer underway:** `src/data/repositories/{matches,roles,interviews}.ts`. `matches` fully migrated across all 8 route files (2 duplicated projections killed; all reads + writes); `roles` + `interviews` write paths centralized. **No route file mutates matches/roles/interviews directly anymore.** Shared `InterviewRound`/`InterviewProposal` types single-sourced. FOUC fix (CSP-hashed pre-paint theme) also shipped.

**Persona 5 remainder:** more repositories (profiles/points — thin, low dedup); **god-file decomposition** (HMDashboard/TalentOnboarding/TalentDashboard → hooks+sub-views — needs a logged-in preview to verify rendering); **`matchForRole` scorer split** (money-adjacent → byte-preserving against the test oracle). Personas 2/3/4/7/8/9 done; 6 skipped.

**Other open (need owner action, careful money-path work, or CI observability):** ToyyibPay verify branch (payment path); W2 deploy unification + migration-tracking reconcile (repo 0162 / prod schema_migrations 0121); `match-expire` N+1 → queue (pipeline-blocked). **Highest-impact remaining action is still the owner's Vault `service_role_key` fix** ([OWNER_ACTIONS.md](./OWNER_ACTIONS.md)).

---

## 2. What "A+" means here (exit criteria — falsifiable, not vibes)

| Dimension | A+ is reached when… |
|---|---|
| Architecture | Match generation is O(candidates) DB round-trips with a flat per-candidate cost (no N+1); zero duplicate-numbered migrations on the apply path; Restaurant OS isolated in its own schema; single-region pinned + documented as a chosen constraint. |
| Performance | One match generation ≤ a few hundred round-trips (memoized pure-fn lookups, batched config, precomputed life-chart char); no frontend N+1 (batch preview RPC); hot dashboards memoized; match-expire off the serial HTTP loop. Scoring **byte-identical** to today (test-oracle verified). |
| Clean-Arch | Recruitment data access flows through a typed repository layer (≤ a handful of direct `supabase.*` calls outside `src/data/`); no component > ~400 LOC; `scoreTalent` decomposed into pure, unit-tested scorers; shared domain types single-sourced; no client/server constant drift. |
| Frontend-UI | Dark mode correct on every authenticated surface (or cleanly gated off) with no FOUC; a11y gate is **blocking at 0 critical/serious** incl. one authenticated-dashboard scan; one `<Modal>` primitive (focus-trap/restore/Escape/scroll-lock) behind every dialog; no user-facing `confirm()/alert()`; i18n active on all non-admin routes with a lint guard. |
| Security | Column-isolation is a **hard** CI assertion; `ALTER DEFAULT PRIVILEGES` pattern prevents future re-exposure; banned users are gated in the SPA + RLS; admin AAL2 requires a real second factor; every payment callback path is signature/return-verified. |
| DevOps | Migrations + edge functions deploy from CI on the same commit as the frontend; a prod-vs-repo drift check gates merges; the RLS suite + `qa/run.mjs` are **blocking**; edge + client errors reach Sentry with source maps; dead-man alerts escalate off-platform. |
| Debugging | `middleware.ts` uses `next()` (verified on Preview); no channel leaks; every cron worker heartbeats in `finally`; per-route error boundaries + a global `unhandledrejection` handler. |

---

## 3. Workstreams (deduplicated — each maps to the grades it lifts)

> Tag key: **[auto]** = ship-safe, we drive it end-to-end · **[decision]** = needs an owner/product call (see §5) · **[$]** = money/scoring/auth-adjacent → byte-preserving + adversarial verify before ship.

### W1 — Collapse the matching-engine N+1  · lifts Performance, Architecture, Debugging  · **[auto][$]**
The single biggest grade-mover (Perf B-→A, and removes Architecture's one ceiling).
- Memoize `get_life_chart_bucket` + `get_year_luck_stage` in an in-process `Map` keyed by `(character,year)`/`(hm_char,talent_char)` — both are IMMUTABLE/STABLE over a tiny char domain (audit Perf-crit, match-core.ts:510,688).
- Precompute `life_chart_character` at talent **write-time** so the match path never calls `decrypt_dob` per row (match-core.ts:787).
- Batch the 27 `system_config` reads into one `.in()` query → `Map` with identical per-key defaults (match-core.ts:163-192).
- Short-circuit `compare_nn_concerns` unless a side actually has a `free_text` atom (match-core.ts:939-960).
- `match-expire`: replace the serial per-role HTTP regenerate loop with `match_queue` enqueue; set-based joins for the warn/ghost N+1 (match-expire/index.ts:205-223,43-70).
- `loadPreviews`: add `get_match_profile_previews(uuid[])` batch RPC (HMDashboard.tsx:190-203).
- **Verify:** existing test oracle + byte-compare scores on a fixed candidate set before/after; load-test one generation's round-trip count.

### W2 — Unify the deploy pipeline + kill drift  · lifts DevOps, Architecture, Security  · **[auto]**
- CI drift check: `supabase migration list --linked` vs repo files → fail on mismatch; one-time reconcile prod `schema_migrations` (insert missing version rows) so repo == prod (audit DevOps-high, ci.yml:137-176).
- CI edge-function deploy job (`supabase functions deploy` via `SUPABASE_ACCESS_TOKEN`, push-to-main or manual-approval) so functions ship with their frontend (DevOps-high).
- Flip the RLS deny/allow suite `continue-on-error: true` → **false** (ci.yml:168) — *after* W3's green run.
- Wire `qa/run.mjs` (21 checks) into CI; gate Vercel prod promotion on CI green (Required Checks).
- Delete the stale root `.vercel/project.json`; reconcile `ROLLBACK_RUNBOOK.md` / `docs/deploy.md` with the now-active Git pipeline.
- Verify a fresh `supabase db reset` applies all files byte-identical to prod; keep the dup-prefix CI guard.

### W3 — Make the authz leak unrepeatable + close session gaps  · lifts Security  · **[auto]** + **[decision]**
- **[auto]** Add a within-row **column-isolation** assertion to the RLS suite: a matched-HM `SELECT *` on `talents`/`matches` must NOT return `ic_path`/`internal_reasoning`/`life_chart_score` (the gap that let it recur 3×; audit Sec-crit / action #2).
- **[auto]** Switch the `ALTER DEFAULT PRIVILEGES` pattern so future tables don't silently re-expose (0119 root cause).
- **[auto]** Banned-user gate in `useSession` bootstrap/refresh (`signOut` + `/banned`) + RLS `is_banned = false` on self/talent/HM read policies (Sec-med, useSession.ts).
- **[deferred]** AdminGate OAuth → require a real TOTP factor regardless of provider (AdminGate.tsx:74-82) — owner skipped this call; left as-is, revisit before final Security A+ sign-off.
- **[locked: build]** ToyyibPay consult callback: add a server-side `getBillTransactions` verify branch in `payment-webhook` (confirm status=1 + amount before flipping consult) (init-consult-booking + payment-webhook).
- **[owner]** Set the Billplz webhook signature secret in the Billplz dashboard (config, not code).
- **[auto]** Drop the wildcard ACAO on pure server-to-server webhooks (cors.ts:10-14).

### W4 — Light up observability  · lifts DevOps, Debugging  · **[auto]**
- Shared edge-function `try/catch` → POST to Sentry/Logflare DSN (money/auth/webhook fns first); zero edge telemetry today (DevOps-med).
- `sentry-cli sourcemaps inject && upload` **before** `strip-sourcemaps.mjs` so client stacks de-minify (DevOps-med, main.tsx:23-37).
- Escalate dead-man alerts off-platform (Resend email / Slack webhook) + an external watchdog (UptimeRobot / cron-job.org) (DevOps-med, 0151/0154).
- Global `window` `unhandledrejection`/`error` → Sentry; per-route `<ErrorBoundary>` subtrees (Debug-low, main.tsx:50-58).

### W5 — Fix `middleware.ts` continuation  · lifts Debugging  · **[auto]** — *do first, high blast radius*
- Add `@vercel/functions`; use `next({headers})` for the allowed `/api/*` path and non-api fall-through; reserve a returned `Response` for the 429 block + 302 admin redirect only (Debug-high, middleware.ts:336-338).
- Also: heartbeat in `finally` for `match-expire` (Debug-low); track realtime channels in a ref + remove prior synchronously (Debug-med, HMDashboard.tsx:418-461); wrap `billplzRefund` fetch in try/catch + roll back on throw (Debug-med, admin-refund:117); tighten `sb-jwt` cookie Max-Age to token TTL (Debug-low).
- **Verify:** Preview deploy — `/api/stats` returns JSON, `/api/set-auth-cookie` sets the cookie.

### W6 — Data layer + god-file decomposition  · lifts Clean-Arch, Performance, Frontend  · **[auto][$ for scorer]** — *the XL, incremental*
- `src/data/repositories/{matches,roles,interviews,profiles,points}.ts` (mirror the clean `lib/restaurant/store.ts`); migrate the 149 direct calls incrementally, `matches` (8 routes) first (CleanArch-high).
- `useAsyncData(fetcher, deps)` hook to retire the 67 raw `useEffect`+supabase loops (CleanArch-med).
- **[$]** Decompose `scoreTalent` into pure `scoreCultureFit/scoreFeedback/scoreGhost/applyWeights` (match-core.ts:494) — composes with W1, byte-preserving, individually unit-tested.
- Break the god-components to < ~400 LOC via custom hooks + extracted sub-views: HMDashboard 1621, TalentOnboarding 1569, TalentDashboard 1353 (CleanArch-high / Frontend-low).
- Single-source domain types in `types/db.ts` (InterviewRound, InterviewProposal, RoleRow, CompanyRow, ChatMessage) (CleanArch-med).
- Source `URGENT_COST`/`POINTS_PER_EXTRA` from the server response, not client literals (CleanArch-med, drift risk).
- Consolidate the three `fmt()` formatters into `lib/format.ts`; fix the test's cross-boundary import via a shared core package (CleanArch-low).

### W7 — Frontend A+ polish  · lifts Frontend-UI  · **[auto]** + one **[decision]**
- **[locked: full theming]** Theme every authenticated dashboard/onboarding/form surface with `dark:` classes (currently dark: lives in only 15 shell/marketing files) + add a pre-paint inline script in `index.html` to kill the FOUC + a theme snapshot/visual test so the half-themed state can't regrow (Frontend-high, useDarkMode.ts:9).
- Fix the login/signup/password-reset/not-found form-label + autofocus violations, flip `a11y.spec.ts` `≤99` → `toHaveLength(0)`, add one **authenticated-dashboard** axe scan with a seeded user (Frontend-high, a11y.spec.ts:45).
- Extract one `<Modal>` primitive (focus-trap + focus-restore + Escape + `aria-modal` + scroll-lock); migrate the ~12 ad-hoc dialogs (Frontend-med).
- Replace user-facing `confirm()/alert()` on money/points actions with `<Alert>`/toast/`<Modal>` (Frontend-med, 22 sites).
- Finish i18n on HM sub-routes (Settings/Account/Company/PostRole/EditRole/OrgChart) + a lint/test flagging untranslated JSX text in non-admin routes (Frontend-med). _NotificationBell already localized 2026-06-27._
- Lint the public restaurant routes (GuestMenu/Track) for a11y (Frontend-low).

### W8 — Architecture scale-hardening  · lifts Architecture  · **[auto]** + one **[decision]**
- **[deferred]** ~~Move Restaurant OS into its own `restaurant.*` schema~~ — owner deferred; keep public schema while the module is flag-off, documented as a chosen constraint. Re-open if Restaurant OS is enabled (Arch-med, 0019).
- `interview_rounds` realtime: per-talent broadcast channel / server-side filter instead of global fan-out (Arch-low / Perf-med, TalentDashboard.tsx:330).
- Pin Vercel function/edge region to the Supabase region; document single-region + the compute-tier upgrade trigger as a chosen constraint (Arch-low).
- Consolidate the hand-rolled session workarounds: pin/upgrade `@supabase/supabase-js`, delete the raw-fetch `fetchIsHM` if fixed, add a bootstrap integration test (Arch-med, supabase.ts/useSession.ts).
- Replace core-path `select('*')` with explicit column lists (Perf-low / Arch).

---

## 4. Sequenced waves (leverage × dependency × risk)

| Wave | Goal | Workstreams | Why this order |
|---|---|---|---|
| **0 — Today** | Stop the bleeding, no-regret | W5 (middleware), W3-auto (column-isolation test + ALTER-DEFAULT fix + banned gate), then W2 (flip RLS gate to blocking) | Small, isolated, high blast-radius; makes the authz leak structurally unrepeatable. RLS gate flips only after the new test goes green. |
| **1 — Pre-scale** | Survive real concurrency + see failures | W1 (N+1 collapse), W4 (telemetry), W2 (deploy unify + drift reconcile) | The matcher is the one thing that won't survive load; don't scale until it's collapsed and you're not flying blind. |
| **2 — Security close-out** | A+ security | W3 remainder ([decision]/[owner] items) | Needs the §5 calls; everything testable is already done in Wave 0. |
| **3 — Frontend A+** | A+ frontend | W7 | Independent of backend; can run in parallel with Wave 1–2. |
| **4 — Maintainability bet** | A+ clean-arch + arch residuals | W6 (data layer, god-files, scorer), W8 | XL, incremental, behind existing seams — last so it never blocks correctness/security work. Scorer decomposition (W6-$) merges with W1. |

Waves 1–3 are largely parallelizable; Wave 4 is the long incremental tail.

---

## 5. Decisions — locked 2026-06-27

| # | Decision | Resolution | Effect on plan |
|---|---|---|---|
| 1 | **Dark mode** | **Fully theme now** | W7 expands to a full dark-theme pass over every authenticated dashboard/onboarding/form surface + pre-paint FOUC script. (Owner is a designer — do it right, not gate it off.) |
| 2 | **Admin MFA** | **Deferred** (skipped) | AdminGate OAuth→AAL2 behavior left as-is for now. Security A+ has ONE remaining open item pending this call; revisit before final A+ sign-off. |
| 3 | **ToyyibPay consult** | **Build verification** | W3 adds the server-side `getBillTransactions` verify branch in `payment-webhook`; consult feature stays live. |
| 4 | **Billplz webhook secret** | **Owner action** | Set the signature secret in the Billplz dashboard — I can't touch credentials. Until then payment-webhook stays fail-closed (good), but the secret must exist in prod for live Billplz callbacks. |
| 5 | **Restaurant schema move** | **Defer** | W8 drops the schema move; Architecture A+ treats single-(public-)schema as a documented chosen constraint while the module is flag-off. Re-open if/when Restaurant OS is enabled. |

**Open A+ blockers after these decisions:** (#2 admin MFA — product) and (#4 Billplz secret — owner config). Everything else is mine to execute autonomously, Wave 0 → 4, phase-by-phase, pushing each as it goes.

---

## 6. Guardrails (unchanged from [AGENTS.md](../AGENTS.md))
- **Money/auth/scoring = byte-preserving.** W1/W6 scorer work gates behind the test oracle + adversarial verify; no scoring output changes.
- **Two-phase deploy** for any column/grant or contract change (additive first, ship frontend, then revoke/cut over) — the pattern proven on 0157/0158.
- **Each wave ships green:** typecheck + 73 tests + build + lefthook, verified live (`version.txt` flip) before the next.
- **No credential entry** (logins, dashboard secrets) — those stay owner actions (§5.4).
