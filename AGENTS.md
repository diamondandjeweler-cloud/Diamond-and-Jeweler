# AGENTS.md — Diamond & Jeweler (DNJ / "BoLe")

> **This is the governor.** Any AI agent or engineer working in this repo reads this first,
> every session, and obeys it regardless of task. It is intentionally short. Task prompts,
> personas, and the parallel-agent blueprint live in the appendix:
> [`./DIAMOND_ENGINEERING_PLAYBOOK.md`](./DIAMOND_ENGINEERING_PLAYBOOK.md) — pull it in when needed,
> not every turn.
>
> **Prime directive:** This is an *existing, pre-launch production* codebase. **Do not change
> product behavior.** Improve quality, scalability, security, maintainability — but every
> change is behavior-preserving unless a task explicitly authorizes a feature change.

---

## 1. 30-second orientation

- **Frontend:** React 18 + Vite 5 + TypeScript 5.5 + Tailwind 3 + React Router 6 + Zustand.
  Single SPA in **`apps/web/`**. The `apps/` folder is **NOT** a real monorepo — there are no
  workspaces, no pnpm/turbo. One app. Don't add workspace tooling without asking.
- **Backend:** Supabase (Postgres 15) — Auth, PostgREST, Storage, **49 Deno Edge Functions**
  (`supabase/functions/`), **176 SQL migrations** (`supabase/migrations/`), pg_cron + pg_net.
- **Deploy:** Vercel **SIN1** (edge, SPA + strict CSP). Data residency: Supabase **Singapore**.
- **Product:** two-sided recruitment marketplace — `talent` ↔ `hiring_manager` / `hr_admin`,
  AI-assisted matching, Diamond Points + Billplz payments, PDPA data-subject requests.
- **`restaurant` schema (~55 tables)** is a separate, feature-flagged module
  (`VITE_ENABLE_RESTAURANT`). Treat it as a different app; keep it isolated from core auth.

## 2. Commands (run from `apps/web/` unless noted)

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Production build | `npm run build` (`tsc --noEmit && vite build && inject-meta && strip-sourcemaps`) |
| Typecheck | `npm run typecheck` |
| Lint / auto-fix | `npm run lint` / `npm run lint:fix` |
| Unit tests (one-shot) | `npm run test:run` |
| E2E | `npm run test:e2e` (Playwright; public routes only, no backend) |
| Regenerate DB types | `npm run types:gen:local` (after `supabase start`) |
| Supabase local | `supabase start` (Docker) |
| Apply migrations | `supabase db push` |

**Pre-commit gate (lefthook):** `lint` + `typecheck` must pass or the commit is blocked.

## 3. The verification gate — how you PROVE a change is safe (this has teeth)

A change is **not done** until:
1. `npm run typecheck` passes, `npm run lint` passes, `npm run test:run` passes — and you
   **actually ran them** (paste the result; never report success you didn't run).
2. If it touches UI: it builds (`npm run build`) and the affected route renders.
3. If you refactor code that has **no test**, you **write a characterization test first** that
   pins current behavior, then refactor against it. No safety net = no refactor.
4. Money / RLS / migration / auth changes additionally pass the named gate in §6.

## 4. Hard rules (the non-negotiables)

1. **Grep before you assume.** A function/file/column exists only if you found it. Cite `file:line`.
2. **Smallest correct change.** Match the surrounding style. The diff should read like the repo.
3. **No fabricated success.** Didn't run it → say so. Tests failed → show the output.
4. **Stay in scope.** Out-of-scope issues get *logged* (append to `docs/AUDIT_LOG.md`), not
   fixed inline. One change, one concern.
5. **Secrets only in Supabase Vault / Vercel env.** Never in code, never in a committed `.env`.
6. **No fortune-telling vocabulary in user-facing copy or DSR exports** — "BaZi", "life chart",
   "fortune", "destiny". This is a **launch blocker** (see §6). Use neutral terms (`signal_*`,
   `outlook_*`, "compatibility").
7. **Irreversible ops are human-gated** (§9): migrations, deletes, deploys, force-push, secret rotation.

## 5. Architecture map (where things live)

```
apps/web/src/
  main.tsx            React entry; Sentry + PWA deferred init
  App.tsx             React Router shell; all routes lazy-loaded
  state/useSession.ts Zustand auth store (session, profile, isHM)
  lib/supabase.ts     Supabase client + in-tab serializing refresh lock  ⚠ load-bearing
  routes/             role dashboards: talent/ hm/ hr/ admin/ + onboarding, points, consult, pdpa
  components/         shared UI (ErrorBoundary, RouteSkeleton, NotificationBell, …)
supabase/
  functions/          49 Deno edge functions (_shared/ = match-core.ts, notify, etc.)
  migrations/         176 SQL files — schema, RLS, cron (4-digit prefixes, 22 duplicates)
  tests/              pgTAP (sparse)
```

**Data flow:** client → Supabase JS (RLS-scoped queries + realtime channels on `matches`,
`interview_rounds`, `notifications`) → Edge Functions (Deno, service-role for privileged work)
→ Postgres. Auth = Supabase PKCE; JWT in session + HttpOnly `sb-jwt` cookie; presence hint via
readable `dnj-auth=1` cookie (presence only — real authz is RLS + edge middleware).

## 6. Danger zones — touch ONLY with the named gate

| Area | Where | Rule / Gate |
|------|-------|-------------|
| **Auth / session** | `lib/supabase.ts`, `state/useSession.ts` | Do **not** remove the in-tab serializing refresh lock — concurrent refreshes burn the single-use token and cascade-fail. |
| **DOB encryption** | pgcrypto; `decrypt_dob()` revoked from `authenticated` in `0068` | Keep it revoked. Re-granting to `authenticated` = mass PII breach. |
| **Money paths** | `payment-webhook`, `redeem-points`, `admin-refund`, `award_points` | Known bugs: `redeem-points` has **no balance check**; `admin-refund` **never claws back points**. Any change here requires idempotency guard + balance guard + a new test. |
| **RLS** | `0003_rls.sql` + ~15 patches; cross-table `EXISTS` recursion | Caused 503 outages historically. Add a deny-suite test (user can't see others' data) **before** changing a policy. |
| **Migrations** | `supabase/migrations/` (176 files, **22 duplicate prefixes**, CI does not replay) | New migration = next **free** number, idempotent, applies cleanly on a throwaway DB. Never renumber existing files blind. |
| **Crons** | `match-expire` (6h), `data-retention` (daily 02:00 MYT) | Fire-and-forget, no dead-man check. Never assume they ran; if logic depends on expiry, verify state directly. |
| **`restaurant` schema** | `restaurant.*`, gated by `VITE_ENABLE_RESTAURANT` | Keep isolated. It couples to core auth via `profiles.role`; don't deepen that coupling. |

## 7. Known live issues — do NOT "rediscover" these as new findings

`AUDIT.md` (repo root) is the standing audit. Before reporting a "new" problem, check it.
Current launch blockers and top debt:
- Consent/DSR **fortune-vocabulary leak**; **DSR export over-shares** scoring rationale (`select('*')`).
- **Money-path bugs** (no balance check / no clawback — see §6).
- **Migration hygiene**: 22 duplicate numbers, no CI replay.
- **~Zero tests** on matcher, money paths, and RLS (929 LOC tests vs ~58k LOC app).
- **Cron reliability**: no heartbeat / dead-man check.
- **Scaling**: N+1 RPC fan-out in `match-core.ts`; god-components (>1.5k LOC); no data-access
  layer (~124 raw `supabase.from()` calls across 43 files).

New findings are welcome — but cite `file:line` and confirm they're not already in `AUDIT.md`.

## 8. When blocked or uncertain (escalation protocol)

- **Can't verify** a change works → say so plainly; do not ship it as "done".
- **Irreversible op** (migration, delete, deploy, force-push, secret change) → **stop and ask**.
- **You disagree** with the request → state the tradeoff once, then defer to the human.
- **A change would alter behavior** → flag it; do not silently ship it.

## 9. Parallel / multi-agent work (the fleet)

For large sweeps (full audit, broad refactor), use the **modules × 6 dimensions** fan-out in
[`DIAMOND_ENGINEERING_PLAYBOOK.md` §6](./DIAMOND_ENGINEERING_PLAYBOOK.md). Rules that still apply
to every agent in the fleet: read-only phases first; **one git worktree per editing agent**
(no shared-tree parallel writes); adversarially verify every finding before acting; and obey
§4–§8 above. A 100-agent run is launched **deliberately**, never inferred.
