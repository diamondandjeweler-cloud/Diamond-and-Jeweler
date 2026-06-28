# Diamond & Jeweler — Scalability & Infrastructure for Growth

_The "senior systems architect designs infrastructure for a high-growth startup" deliverable (Persona 6). ARCHITECTURE.md documents the structure as-built; this documents how it **scales** — the caching strategy and the per-growth-stage infrastructure roadmap. Grounded in the live system 2026-06-27._

> **Design principle:** the system is already a *minimal implementation that can scale* — a static SPA on a CDN, a managed Postgres with RLS, async work on a queue, and stateless edge functions. Nothing here is a rewrite; every scaling step is an additive change behind an existing seam. This doc names the seams and the trigger for each step.

---

## 1. Scale model & growth stages

The marketplace has two very different load profiles:

| Surface | Load shape | Scaling property |
|---|---|---|
| **Read / browse** (landing, careers, job pages, dashboards) | High volume, cacheable | **Already scales** — CDN + SW + indexed reads. Stateless. |
| **Match generation** (the compute core) | Low volume, expensive, bursty | **Throughput-bound** — O(candidates) per generation, queue-drained. The one thing to watch. |
| **Money / mutations** | Low volume, must be correct | Idempotent CAS; concurrency-safe. |

| Stage | Users | Binding constraint | Add |
|---|---|---|---|
| **Pilot (now)** | <1k | none (single nano/micro Supabase, single region) | — |
| **Growth** | ~10k | match-gen throughput, Supabase compute | collapse matcher N+1 *(done)*, bump compute tier, shared rate-limit store |
| **Scale** | ~100k | Postgres connections, realtime fan-out, hot-table size | queue workers, read replica for reporting, partition `matches`/`audit_log`, per-entity realtime channels |
| **Hyper** | ~1M | region latency, single-region SPOF | multi-region read, edge cache of public pages, dedicated match-worker pool |

---

## 2. Caching strategy (7 layers)

The heart of the infra design. Each layer has an **invalidation** rule — the part people get wrong.

| # | Layer | What | Invalidation | Status / next |
|---|---|---|---|---|
| 1 | **CDN edge** (Vercel SIN1) | Immutable hashed JS/CSS assets `public, max-age, immutable`; HTML `no-store`; `/api/*` `no-store` | Content hash in filename → new deploy = new URL | ✅ in `vercel.json` |
| 2 | **Service worker** | injectManifest precache, **cache-first** for hashed assets | `CACHE_VERSION` bump on deploy | ✅ — bump only when a runtime change must reach all clients at once (avoids a reload+re-auth thundering herd) |
| 3 | **Client SWR cache** | `dashboardCache.ts` (sessionStorage, PDPA-aware — aggregates only, no PII/IDs) hydrates KPIs instantly; `prefetch.ts` role-aware route prefetch | sessionStorage (clears on tab close) + revalidate-on-load | ✅ |
| 4 | **DB materialized cache** | `mv_admin_kpis` (match funnel) + `admin_kpi_cache` (user counts), read by `get_admin_kpis_fast()` in <5ms instead of ~10 COUNT scans | pg_cron refresh every 2 min *(refresh bug fixed 0160)* | ✅ — pattern to replicate for any expensive admin aggregate |
| 5 | **RLS plan cache** | `(select auth.uid())` wrapping (0138) lets Postgres cache the RLS query plan instead of re-evaluating per row | query-plan level (automatic) | ✅ — keep this idiom in every new policy |
| 6 | **In-process memo** (edge) | matcher memoizes the STABLE life-chart/year-luck RPCs + batches 27 config reads per generation | per-invocation (Map lives for one generation) | ✅ *(W1)* |
| 7 | **Function warm cache** | `warmup-*` pg_cron jobs ping money/auth functions every 15 min to avoid cold starts | time-based ping | ✅ |

**Caching to ADD as you grow (not yet needed):**
- **Public-page edge cache** — `/`, `/careers`, `/jobs/*`, `/stats` are anonymous + cacheable. At Growth, add `s-maxage` + `stale-while-revalidate` (the bot-OG path + `/api/stats` already do) so origin sees almost no read traffic.
- **Shared rate-limit / hot-key cache** — see §4.
- **Candidate-pool cache** — at Scale, the `get_match_candidates` pre-filter could cache per-role for a short TTL (candidates change slowly) to cut repeat generations.

---

## 3. Component structure for scale (what's stateless vs stateful)

```
Stateless / horizontally scalable (just add instances):
  • SPA (CDN)         • Vercel /api edge fns      • 48 Deno edge fns
  • match-core scorer • match queue workers (add more cron/pg_net callers)

Stateful / the scaling pressure points:
  • Postgres (connections, hot tables matches/audit_log, RLS eval)
  • Realtime (fan-out per subscriber)
  • Vault secrets + pg_cron (the async backbone's SPOF — see §5)
  • In-memory edge rate-limiter (per-isolate → not a global quota)
```

The rule: **keep compute stateless, push state to Postgres, and make every expensive Postgres read either indexed, set-based + LIMIT-capped, or cached (layer 4).**

---

## 4. The two infra changes that matter first

**A. Match-generation throughput (the core).** One generation = O(candidates) work, queue-drained (`process-match-queue`, `FOR UPDATE SKIP LOCKED`, retry cap). It's *horizontally scalable by adding workers* — but each generation must be cheap. The N+1 collapse (W1: memoize STABLE RPCs, batch config, precompute life-chart-char, short-circuit pgvector) is the prerequisite; do it **before** raising concurrency or pool size. To add throughput at Scale: more pg_cron/pg_net callers draining the queue in parallel, or a dedicated worker that long-polls the queue.

**B. Rate limiting / abuse (the perimeter).** `middleware.ts` uses an in-memory `Map<ip,bucket>` (100/min) — **per edge isolate**, so the effective global limit is `100 × isolate_count` and resets on cold start. It's a cheap first layer, **not a hard quota**. Before any traffic event, back it with a shared store (Upstash Redis / Vercel KV keyed by IP) or Vercel WAF rate rules. Same shared-store pattern then serves hot-key caching (layer 2-add).

---

## 5. Reliability at scale (the SPOFs to remove)

1. **Vault `service_role_key` + pg_cron** — the entire async backbone (match-gen/expire/queue, retention) runs through pg_cron→pg_net→edge authenticated by one Vault secret. A stale key silently 403s everything (it did — 27 days). **Mitigation shipped:** `/api/health` (503 when the heartbeat is stale) → external monitor. **At scale:** also escalate the dead-man off-platform and consider a second invocation path.
2. **Single region** — correct for a Malaysia-first pilot; pin Vercel functions to the Supabase region and document the compute-tier upgrade trigger. At Hyper: multi-region read + edge-cached public pages.
3. **PITR-only rollback** — a bad migration's blast radius is the whole project. Partition hot tables (`matches`, `audit_log`) as they grow and rehearse the quarterly restore drill.
4. **Connection pressure** — `authenticate()` does a `getUser` + profiles SELECT per edge call. At high RPS, verify the JWT locally (the admin middleware already does) + read role/is_banned from claims or a short-TTL cache to halve auth round-trips.

---

## 6. Minimal-but-scalable: what's already right

Worth stating, because the temptation at each stage is to over-build:
- **Candidate filtering is set-based + `LIMIT 500`** — won't degrade with talent-pool growth (the single most important marketplace scale property).
- **Money paths are idempotent CAS** — safe under any concurrency, no distributed lock needed.
- **Async work is queue-drained, not request-path** — generations are independent and horizontally scalable.
- **Reads are CDN/SW/MV-cached** — origin and Postgres see a fraction of traffic.
- **No app server to scale** — Vercel + Supabase are managed; you scale by configuration (compute tier, workers, cache store), not by running boxes.

The honest summary: **the architecture is already shaped for millions; the work is operational** — collapse the matcher N+1 *(done)*, move the rate-limiter to a shared store, bump the compute tier, partition hot tables, and remove the Vault/cron SPOF. Each is additive, behind a seam that already exists.
