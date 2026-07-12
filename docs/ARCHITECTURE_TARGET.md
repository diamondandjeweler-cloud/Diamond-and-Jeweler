# Diamond & Jeweler — Target Architecture (strangler dossier)

_Companion to [ARCHITECTURE.md](./ARCHITECTURE.md), which documents the system **as built**. This file
tracks the **target-state** the incremental (strangler) refactor is converging on: what has already been
realized, and what remains. Grounded in the live tree at tip `c9c5fef` (2026-07-12)._

> Purpose: a single place to see "where are we in the migration" without re-deriving it from the diff.
> When a target item lands, move it from **Gaps** to **Realized** with its commit/path.

---

## 1. The target in one sentence

A **thin edge, fat Postgres, queue-drained async core** with a clean seam between the SPA and the data
plane: React routes gated by declarative guards, matching decoupled through a durable queue, edge
functions composed from shared `_shared/*` modules, uniform structured logging, and every migration
replayed on ephemeral Postgres in CI before it can reach prod.

---

## 2. Realized (already true on `main`)

### 2.1 Matcher async pipeline via `match_queue`
The expensive path is fully decoupled from the request:
- `roles` change → enqueue into **`match_queue`**; `process-match-queue` drains it on a **pg_cron (1 min) → pg_net → edge** loop using **`FOR UPDATE SKIP LOCKED`** with a **retry cap (3)** — horizontally scalable by adding workers.
- The scorer inserts matches first (`status='generated'`, `summary=null`) and the LLM "pitch" is an **async UPDATE off the insert path**, so scoring never blocks on the model.
- Candidate pre-filtering is a set-based SQL RPC (`get_match_candidates`, `LIMIT 500`) — the property that keeps latency flat as the talent pool grows.
- See ARCHITECTURE §7 for the full data-flow diagram; migrations `0191` (matcher diversity v2 + salary-null) are the latest tuning.

### 2.2 Shared edge modules — `supabase/functions/_shared/*`
Edge functions compose from a shared library rather than duplicating logic:
`match-core.ts` (the scorer) + `match-scoring.ts` + `match-reasoning.ts` + `non-negotiables.ts`,
`auth.ts`, `supabase.ts`, `cors.ts`, `audit.ts`, `idempotency.ts`, `ratelimit.ts`, `pool.ts`,
`observe.ts`, `logger.ts`, `embeddings.ts`, `talent-extraction.ts`, `myinvois.ts`. These carry their own
unit tests (`match-core.test.ts`, `match-core-synonyms.test.ts`, `pool.test.ts`).

### 2.3 SPA routing guards — `apps/web/src/app/routing/guards/*`
Route authorization is declarative and centralized, not scattered per-page:
`ProtectedRoute.tsx`, `RoleGate.tsx`, `AdminGate.tsx`, `ConsentGate.tsx`, `OnboardingGate.tsx`, composed
by `Guarded.tsx` (with `Guarded.test.tsx`). RLS remains the *real* authorization boundary in Postgres;
these guards are the UX/routing layer on top.

### 2.4 Structured logging — `logger.ts` (web + edge)
A single logging seam on both sides (`apps/web/src/lib/logger.ts`, `supabase/functions/_shared/logger.ts`,
`fb480e9`): a zero-dependency, behaviour-preserving `console.*` wrapper adding a consistent level +
`[scope]` prefix, giving one place to later route logs to Sentry / an aggregator without touching call
sites. It never throws and never auto-captures (explicit telemetry calls are left as-is).

### 2.5 Ephemeral-Postgres CI replay — `.github/workflows/ci.yml`
Every migration is replayed against a **throwaway local Supabase Postgres** (`supabase db reset` re-runs
all migrations from `0001`) on each CI run, so a broken or non-idempotent migration fails CI instead of
prod. CI also gates: numbered/paired migration files, **no NEW duplicate number prefixes**, **no NEW
permissive RLS policy / anon grant**, and a post-reset check that the `CONCURRENTLY` pre-filter indexes
exist and are valid.

### 2.6 Money-path invariants
Idempotent payment/points paths (`payment-webhook` signature-verify + atomic CAS idempotency →
`award_points` with an idempotency key); `0192` reconciles the points counter faithfully; `0193` adds a
realtime `hm_id` spoof guard. These are the "don't double-charge / don't double-credit" invariants the
target requires.

---

## 3. Gaps (target items not yet realized)

| Gap | Target | Why it matters | Reference |
|---|---|---|---|
| **SSG for public/marketing routes** | Pre-render the public surface (landing, legal, blog) to static HTML instead of shipping them through the SPA boot path. | Faster first paint + resilience: a JS-chunk error (cf. the 07-10 white-screen) shouldn't blank the public front door. | `OWNER_ONEPAGER_PATH_TO_100.md` (B-wave); perf audit |
| **Durable webhook inbox** | Land inbound webhooks (Billplz/ToyyibPay, delivery partners) into a durable inbox table + drain them like `match_queue`, instead of processing inline in the request. | Inline handlers drop payloads on a transient failure; an inbox makes ingestion replayable and decoupled. | ARCHITECTURE §5D; STATUS "open big levers" |
| **Declarative partitioning** | Partition `audit_log` / `notification_outbox` / `match_history` before they get large. | A destructive table rewrite — must be rehearsed on staging, never in a normal migration. Blocked on a staging/UAT environment. | [PARTITIONING_RUNBOOK.md](./PARTITIONING_RUNBOOK.md) |
| **Data-access layer** | Route the ~149 direct PostgREST call sites through a repository/`useAsyncData` seam. | Removes the last big maintainability debt; makes read caching + error handling uniform. | ARCHITECTURE §6, §8 |
| **Restaurant bounded-context split** | Move Restaurant OS out of the shared `public` schema (into `restaurant.*` or a separate stream/repo). | Currently co-located and flag-gated; isolation is viable but deferred. | ARCHITECTURE §4 |
| **Server-side secrecy sanitisation (H5)** | Move the org-chart/life-chart vocabulary sanitiser server-side so the secret vocabulary never reaches the client bundle. | Today the regex map ships in `dist/assets/*`, which blocks `01-bazi-secrecy` from being a hard CI gate. | STATUS "open items"; staged H5 fix |

---

## 4. How to use this doc

- **Before proposing a refactor:** check whether it's already a Realized item (don't redo) or a listed Gap (scope against the reference).
- **When a Gap lands:** move it to §2 with the commit + path, and update `ARCHITECTURE.md` if the as-built shape changed.
- **Governing constraint:** every step is behaviour-preserving and test-backed (AGENTS.md §7.3). No safety net ⇒ defer, don't force.
