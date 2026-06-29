# Diamond & Jeweler — Scale to Millions: Reference Architecture, Comparison & Phased Plan

_The "senior full-stack engineer designs a production startup that scales to millions, then compares it to what we have and ships it phase by phase" deliverable. Companion to [ARCHITECTURE.md](./ARCHITECTURE.md) (as-built), [SCALABILITY.md](./SCALABILITY.md) (growth infra), and [ROAD_TO_A_PLUS.md](./ROAD_TO_A_PLUS.md) (grade roadmap). Grounded in the live tree + a 33-agent audit/verify/design pass, 2026-06-30._

---

## 0. The verdict (read this first)

**DNJ does not need to be rebuilt to reach millions of users. It needs to be *finished*.**

The architecture is already the textbook shape for a marketplace at scale: a static SPA on a CDN, managed Postgres with RLS as the authorization boundary, async work drained off a `SKIP LOCKED` queue, stateless edge functions, idempotent money paths, and a build-time-prerendered public SEO surface that makes **zero** DB calls. An independent, adversarial re-audit confirmed this: of the headline "scaling cliffs," most were already mitigated in code, and the rest are **additive changes behind seams that already exist** — not re-architecture.

So this plan is deliberately *anti-heroic*. Every step is the smallest correct addition behind an existing seam, sequenced so **correctness + money + observability land first**, scale-infra second, and the maintainability refactor last (incremental, never blocking).

The honest one-liner: **the perimeter is hard (auth, payments, RLS rows, CI), the centre (compute throughput, deploy enforcement, test net) is where you bleed at volume — and the single biggest production risk today is operational, not architectural** (the async pipeline silently died for 27 days on a stale Vault key with no external monitor).

---

## 1. Scale model — what actually binds at each stage

| Stage | Users | Binding constraint | The work |
|---|---|---|---|
| **Pilot** | <1k | none (single nano/micro Supabase, single region) | money correctness · revive + monitor the pipeline · activate the test net |
| **Growth** | ~10k | match-gen throughput · Supabase compute · connection slots | parallelize queue drain · write-time precompute the matcher N+1 · shared rate-limit quota · bump compute tier |
| **Scale** | ~100k | Postgres hot-table size · Realtime fan-out · reporting load | partition append-only tables · read replica for reporting · multiplex realtime channels |
| **Hyper** | ~1M | region latency · single-region SPOF | multi-region read · edge-cache public pages (done) · dedicated match-worker pool |

The two load profiles never collide: **reads** (landing/jobs/dashboards) are high-volume + cacheable and already scale on the CDN; **match generation** is low-volume, expensive, bursty, and queue-drained — that is the one thing to watch.

---

## 2. The six deliverables — reference design vs. DNJ today

For each: the ideal at ~1M users, how DNJ aligns, and the additive steps to close it.

### 2.1 System architecture — **alignment: strong (partial)**

**Ideal:** three planes — CDN-served static client, a thin stateless edge (rate-limit + auth gate + webhooks), and a managed Postgres core where RLS is the authz boundary and expensive work is queue-drained by a horizontally-scalable worker pool. No app server. Multi-region read at the very top end only.

**DNJ:** exactly this — SPA on Vercel SIN1, 49 Deno edge functions, `process-match-queue` drained by pg_cron→pg_net, a single shared `match-core.ts` scorer reused by 6 functions, async-decoupled LLM pitch. The gap is *throughput*, not shape.

**Add to reach millions (ordered by leverage):**
1. **Parallelize the queue drain** behind the existing `claim_match_queue_batch` SKIP-LOCKED seam — register K cron callers (or one cron firing K `pg_net` posts). Pure throughput, zero correctness work — it's already concurrency-safe. *(Growth)*
2. **Collapse the residual matcher N+1 by write-time precompute** — persist `life_chart_character` + age/peak buckets when the talent profile is written so the hot loop never calls `decrypt_dob`/`compute_age_match_score`/`get_peak_age_score` per row (~1,500 round-trips/generation → 0). Pay the cost once on the low-QPS write. Gate behind the now-extracted scoring tests + a byte-compare. *(Growth)*
3. **Revive + harden the async-backbone watchdog** so the 27-day-dead incident cannot recur (see §4). *(Pilot — owner)*

### 2.2 File structure — **alignment: partial**

**Ideal:** one app, a typed data-access layer as the only path to the DB, generated DB types as a compile-time schema contract, and module isolation (restaurant) enforced by lint, not convention.

**DNJ:** `apps/web` single SPA + `supabase/` (functions + 186 migrations). The `data/repositories/` seam exists (matches/roles/interviews) but covers a fraction; ~129 raw `supabase.from/.rpc` calls remain across ~50 files; `types:gen` scripts exist but **no `db.generated.ts` is committed**.

**Add:**
1. **Make the type-gen seam load-bearing** — commit `db.generated.ts`, type the repository projections against it, add a CI drift check (`regenerate + git diff --exit-code`). Turns every column/RLS change from a silent prod risk into a `tsc` error, and makes the private-column boundary a *compile error* not a comment.
2. **Finish the repository migration** one aggregate at a time; add an eslint `no-restricted-syntax` rule banning `supabase.from` outside `src/data/repositories/**` so the seam can't regress. *(Growth — incremental)*
3. **Enforce the restaurant one-way boundary** with `no-restricted-imports`; move restaurant DDL to its own schema before it's enabled. *(Scale, only if restaurant launches)*

### 2.3 Database schema — **alignment: strong (partial)**

**Ideal:** normalized core, RLS plan-cached via `(select auth.uid())`, hot/append-only tables partitioned by range, a read replica for reporting, expensive aggregates behind materialized caches.

**DNJ:** 62 tables, RLS plan-cache idiom in place (0138), `mv_admin_kpis` cache, BRIN on time ranges, set-based + `LIMIT 500` candidate filter (the key marketplace property — won't degrade with pool growth). Gaps are at the Scale horizon.

**Add:**
1. **Partition the append-only tables first** (`audit_log`, `notification_outbox`, `match_history`) `PARTITION BY RANGE (created_at)` with a pre-create/retention cron — turns the 730-day audit purge from a giant `DELETE` into a `DROP PARTITION`. Leave `matches` (its `UNIQUE(role_id,talent_id)` makes it a bigger project) until ~100k roles. *(Scale)*
2. **Add a `notification_outbox` retention cron now** — it grows forever with no purge today (cheap, non-destructive, under-tracked). *(Pilot)*
3. **Move `CREATE INDEX CONCURRENTLY` out of transactional migrations** — the GIN/talent pre-filter indexes (0074/0134) are wrapped in a txn and likely never created in prod, silently degrading the candidate pre-filter to a seq-scan. Verify against live `pg_indexes`; create them in a non-transactional post-deploy script. *(Growth — highest-leverage DB fix)*
4. **Read replica for reporting** — point the MV refresh + ad-hoc analytics at a replica DSN so a runaway scan can't starve the matcher's primary pool. *(Hyper)*

### 2.4 API endpoints — **alignment: partial → improving**

**Ideal:** RLS-scoped PostgREST for default reads, `SECURITY DEFINER` RPCs for hot/admin/privileged paths, edge functions for orchestration + webhooks, every cron/webhook function pinned `verify_jwt=false` with its own signature/service check, and a global (not per-isolate) rate-limit quota on money/match endpoints.

**DNJ:** all four layers used correctly. The real holes were config-level, not design-level — and the top one is **fixed in this session** (§3).

**Add:**
1. ✅ **Pin `payment-webhook` + `resend-webhook` `verify_jwt=false`** — *shipped this session* (they were absent → the gateway would 401 the Billplz/Resend callback before the HMAC check; silent payment-fulfilment failure at launch).
2. **A config invariant test** asserting every signature/service function is pinned — converts tribal knowledge into a blocking gate.
3. **Reuse `check_and_increment_rate` (0150)** — call it from `match-generate`, `unlock-extra-match`, `buy-points`, `redeem-points`, `init-consult-booking`. The DB-backed global quota already exists; it's only wired to the 7 `extract-*` functions today. One line each. *(Growth)*
4. **Idempotency-Key on client money POSTs** — a `request_dedup` table + `withIdempotency()` wrapper so a double-click can't create two Billplz bills (DB CAS already protects the *grant*; this protects *bill creation*). *(Growth)*

### 2.5 UI architecture — **alignment: strong (partial)**

**Ideal:** hard split between an anonymous, CDN-cacheable, SEO-prerendered public surface and an authenticated SPA; route-level code-split; a typed data-access hook layer with request-dedup/SWR caching on top of repositories; multiplexed realtime; design system; a11y/i18n.

**DNJ:** the public surface is *exemplary* — Landing/Careers/jobs/silo pages make **zero** DB calls (verified), render from static `silo-data.ts`, are prebuilt to ~54 HTML files with unique meta/OG/JSON-LD, and serve from CDN with `s-maxage=86400` + 7-day SWR. Full SSR is **not** needed here. The weakness is the authenticated data layer (raw `useEffect`+`supabase.from` per view, no client cache, three god-components).

**Add:**
1. **A query-cache hook over the repository seam** — wrap each repo fn in SWR (~4KB) for request dedup + stale-while-revalidate + focus refetch. Highest-leverage UI step; no rewrite. *(Growth)*
2. **Multiplex per-user realtime channels** — collapse the 3 channels/session (HM matches + talent matches + notifications) into one `useRealtime()` channel per tab; fix the `Date.now()` in the HM channel name that churns channels on every mount. Cuts concurrent Realtime connections ~3× before the Scale ceiling. *(Scale)*
3. **Lazy-load `ms.json`/`zh.json`** and split the 1247-line `silo-data.ts` content out of the route-enumeration arrays — Pilot payload wins, zero behavior change.
4. **Decompose the god-components behind the new hooks** (HMDashboard 1610 / TalentOnboarding 1569 / TalentDashboard 1336 LOC) — incremental, test-guarded. *(Growth — velocity, not runtime)*

### 2.6 Production-ready code — **alignment: partial → improving**

**Ideal:** a typed repository layer, idempotency guards with tests, observability on every plane (health + heartbeat + client *and* edge Sentry), a real test net on matcher/money/RLS, and CI gates that block on what matters.

**DNJ:** excellent perimeter (idempotent money CAS, poison-pill queue, `/api/health` deep liveness, client Sentry, blocking column-isolation CI gate, auto-recovering ErrorBoundary). The soft centre: **edge telemetry is dark**, the **money/scoring/RLS test net was missing or unwired**, and the **RLS row-deny suite is advisory**.

**Add:**
1. ✅ **Activate the 16 money-path tests in CI** + ✅ **extract `scoreTalent`'s composition into a pure, 12-test module** — *both shipped this session* (§3).
2. **A shared edge error reporter** (`_shared/observe.ts` → POST to `SENTRY_DSN_EDGE`, no-op when unset) wired into payment-webhook / process-match-queue / admin-refund / match-generate. Edge failures are invisible today. *(Pilot — code; owner sets DSN)*
3. **Flip `rls_deny.sql` to blocking** — run it once green against the reset DB, then delete the one `continue-on-error: true` line. *(owner observes green first)*
4. **A seeded-Postgres exactly-once test** replaying a webhook twice — proves the no-double-credit guard, not just the signature primitive. *(needs local supabase to author)*

---

## 3. What shipped this session (branch `feat/scale-to-millions`)

All four are behavior-preserving, verified locally (typecheck + 85 vitest + lint + build green), committed — **not yet pushed/deployed** (DNJ governance human-gates deploys; the pipeline is mid-incident pending the Vault key).

| # | Commit | What | Verify here? |
|---|---|---|---|
| 1 | `521ee76` | Pin `payment-webhook` + `resend-webhook` `verify_jwt=false` (the P1 silent-payment bug) | static-correct |
| 2 | `d4ab5db` | Extract pure `composeFinalScore` + 12 golden-vector scoring tests (byte-preserving) | ✅ vitest 85/85, tsc, build |
| 3 | `cbbd0d9` | CI `edge-tests` job activating the 16 money-path Deno tests | yaml-valid |
| 4 | `b62eb3f` | Pin Vercel functions to `sin1` (co-locate with Supabase Singapore) | json-valid, build |

---

## 4. Owner-only actions (I cannot do these — credentials / irreversible / product calls)

Ordered by urgency. The first two are what would have caught the 27-day outage.

1. 🔴 **Rotate the Vault `service_role_key`** — the entire async backbone (match-gen/expire/queue, retention) 403s on a stale key. `select vault.update_secret((select id from vault.secrets where name='service_role_key'), '<service_role key>');` then confirm `cron_heartbeat` populates + `/api/health` → 200. *Until this is done, no matches generate.*
2. 🟠 **Point a free external monitor** (UptimeRobot / cron-job.org) at `https://diamondandjeweler.com/api/health` every 5 min → email/Telegram.
3. 🟡 **Set the Billplz webhook signature secret** in the Billplz dashboard (payment-webhook stays fail-closed until then — good, but live payments need it).
4. 🟡 **Admin-MFA decision** (TOTP vs OAuth-only) — product call, blocks final Security A+.
5. 🟢 **Deploy this branch's edge/config changes**: `supabase functions deploy payment-webhook resend-webhook`; `deno check` `match-core.ts` + run one sample generation byte-compare before deploying it; redeploy the frontend for the `sin1` pin. Reconcile `schema_migrations` (prod ~0121 / repo 0162) before ever running `db push`.

---

## 5. Remaining phases (continuing autonomously, behind existing seams)

Each ships green + commits independently; none re-architects.

- **P5 — Edge observability:** `_shared/observe.ts` reporter wired into the 4 money/match functions (code mine; DSN owner). + extend `pipeline_health()` to a failure-ratio "degraded" so the monitor pages on *partial* matcher failure, not just total death.
- **P6 — Data-access seam:** route the 2 residual `matches` reads + `InterviewFeedback` write through repositories; commit `db.generated.ts`; add the `no-restricted-syntax` guard (warn).
- **P7 — Global rate-limit quota:** one-line `enforceRateLimit` on the 5 money/match functions (reuse `check_and_increment_rate`); back the `/api/*` middleware limiter with the same DB quota or a Vercel WAF rule.
- **P8 — DB scale-infra (migration FILES, owner applies):** `notification_outbox` retention cron; the `CONCURRENTLY` index post-deploy script; partition migration for `audit_log`/`notification_outbox`/`match_history`.
- **P9 — CI hardening:** wire `check-migration-drift.mjs` as an advisory job; add the `config.toml` verify_jwt invariant test; flip `rls_deny.sql` to blocking *after* an observed green run.

---

## 6. Guardrails (inherited from AGENTS.md)

- **Money / auth / scoring = byte-preserving**, gated behind tests + adversarial verify before ship. The scoring extraction is byte-identical by construction; owner runs the runtime byte-compare before edge deploy.
- **Two-phase deploy** for any column/grant/contract change (additive → ship → cut over).
- **Each phase ships green** (typecheck + tests + lint + build) before the next.
- **No credential entry, no irreversible ops** (migrations/deploys/secret rotation) without the owner — those are §4.
