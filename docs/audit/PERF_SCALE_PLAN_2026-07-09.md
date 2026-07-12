<!-- Plan-only (@suggest) audit generated 2026-07-09. 46 verified findings (48 raised, 2 refuted) across 6 dimensions, adversarially verified. No source files were changed. -->

# BoLe / DNJ (diamondandjeweler.com) — Final Performance & Scalability Plan

**Scope:** Plan-only (@suggest) principal-level audit toward millions of users. 46 verified findings across 6 dimensions, deduplicated and re-severitised. No files were changed.

---

## 1. Executive Summary

DNJ is **already a mature, deliberately-optimised front end** — and the reader should trust that the remaining findings are the non-obvious tail, not low-hanging fruit. What is already right:

- Deferred Sentry, post-paint SW registration (`injectRegister:null`), manual vendor chunks, lazy routes, route prefetch.
- RPC aggregation for the biggest reads (`get_match_profile_previews`, `mv_admin_kpis`), a partial-index discipline on hot predicates, and `reltuples`-friendly schema.
- localStorage dashboard-cache instant hydration, SWR/`useQuery` seam (live in `KpiPanel`/`AuditLogPanel`), delta-sync, in-flight dedup on the CRM data layer.
- Idempotency store on the money path, notification-outbox with retention, `enqueue_roles_for_rematch` queue pattern that several cron jobs already adopted.

**The five biggest remaining levers (in impact order):**

1. **Prerender the public SEO/silo routes (SSG/ISR).** `/careers`, `/jobs/*`, `/jobs-in-*`, `/hire-*` today ship only meta + a `<noscript>` block; real content LCP is gated on ~220KB gzip of JS parse + React mount. These are the exact pages that must rank and convert paid traffic. **Biggest business lever.** *(Bundle/Assets — high)*

2. **Stop shipping the whole backend/i18n to anonymous visitors.** The `@supabase/supabase-js` client (50KB gzip) and all three full locales (~158KB raw, 30–40KB gzip of dead JSON) sit in the eager entry graph and are modulepreloaded on static marketing pages that touch neither auth nor the DB. **Largest trimmable slice of the critical path.** *(Bundle/Assets — high)*

3. **Kill the restaurant-module N+1 query fan-outs.** KDS re-fetches line items one-query-per-order **on a 5s poll forever**; Reports fires **up to 500 concurrent** per-order queries per open; delivery webhooks do 2N+2 serial inserts inside the platform 5s ack window. On a nano/micro PostgREST pool this is a self-inflicted, standing query storm against the exact ceiling (connections + write path). **Biggest DB-load lever.** *(Data/Serverless — high)*

4. **Cut the background CPU floor on Supabase.** The admin-KPI cron does ~10 aggregate scans (incl. a full `matches` `count(*) FILTER` scan) **every 2 minutes, 720×/day, whether or not an admin is online**; the match-generation hot path's candidate query defeats its purpose-built GIN indexes via `ORDER BY … LIMIT`. These are the permanent, scale-linear drains. *(Database — high)*

5. **Bound the cron/edge write-path jobs.** `match-expire`, `proactive-job-push`, and `retry-stuck-extractions` all do per-row N+1 relational lookups with no per-run cap; a recovery spike can blow the edge wall-clock and saturate the connection pool exactly when the DB is already behind. Convert to set-based RPCs + batch enqueue. *(Serverless/Database — high/medium)*

**Expected wins in plain terms:** sub-1s LCP on marketing/SEO pages (from ~2.5–4s CSR), ~80–100KB gzip off the critical path for anonymous visitors, one-to-two orders of magnitude fewer restaurant queries per screen-minute, and removal of a per-2-minute Postgres CPU tax that would otherwise grow linearly with table size.

**Honesty note:** several submitted items were **refuted or downgraded** in verification — the `silo-data.ts` "drag into main chunk" fix was a no-op, the "every SEO view hits Supabase" claim was factually false (those pages hit the DB zero times), and the es2020→es2022 bump is a free tidy with ~0 real app-code savings. That diligence is why the high-severity items below are worth trusting.

---

## 2. Performance Issue Breakdown (by dimension, severity-ordered)

### 2.1 Bundle / Assets

| # | Problem (one-line) | File:line | Impact at scale | Sev |
|---|---|---|---|---|
| B1 | Static silo/careers routes are pure CSR — prerendered HTML is only meta + `<noscript>`; LCP gated on full SPA boot | `scripts/inject-meta.mjs:776` | 2.5–4s LCP (est.) vs sub-1s on the exact pages that must rank; caps CWV + paid conversion | **high** |
| B2 | All 3 full locales statically imported into the entry chunk (`resources` map) | `src/lib/i18n.ts:4` | ~30–40KB gzip dead JSON + synchronous `JSON.parse` of ~158KB unused strings before FMP, every cold load | **high** |
| B3 | Supabase client (50KB gz) eagerly loaded + modulepreloaded on anonymous SEO routes | `src/main.tsx:16` | 184KB raw parse/eval + GoTrue/realtime timers on pages that never auth; every crawler/bounce instantiates a client | **high** |
| B4 | SW precaches all 10 woff2 subsets incl. cyrillic/greek/vietnamese | `vite.config.ts:30` | ~97KB never-rendered fonts fetched at SW install per device (one-time) | low |
| B5 | Fonts render-blocking via `@import`, no `<link rel=preload>`; Fraunces full axis for headings only | `src/index.css:6` | Longer FOUT window + late reflow/CLS on swap (LCP itself unaffected — `font-display:swap` paints fallback) | low |
| B6 | `og-image.png` is a 312KB unoptimised PNG | `public/og-image.png` | ~250KB avoidable transfer per social scrape; **zero** real-user impact (crawler-only) | low |
| B7 | Build target `es2020` downlevels unnecessarily | `vite.config.ts:58` | **~0 app-code savings** (async/await is ES2017; 0 classes, 3 logical-assign in test-only). Free tidy, not a lever | low |

**Verifier tempering that matters:** B1's "2.5–4s" is an unverified estimate and the FCP skeleton paints instantly (concern is strictly real-content LCP + crawl budget, not de-indexing); the full-`<App/>` `renderToString` fix **underplays hydration-mismatch risk** (auth nav, ConsentGate, detected locale, Zustand-persist all touch browser APIs) — prefer `vite-react-ssg` or prerender only the static silo island. B2 needs the `i18next-resources-to-backend` dep and a `useSuspense:false`/loading state on language switch. B3's effort is **M–L not M** (8 files statically import the client singleton; auth-bug risk).

### 2.2 React Rendering

| # | Problem | File:line | Impact | Sev |
|---|---|---|---|---|
| R1 | `useSession()` subscribed whole-store (no selector) at App root + Layout + ~40 consumers | `src/App.tsx:120` | Every ~hourly token refresh / visibility re-warm re-renders the entire mounted route tree from root. Reconciliation CPU only (no DOM change), infrequent trigger | medium |
| R2 | HMDashboard defeats `memo` on cards via ~11 inline callbacks + fresh object literals + global `actionBusy` | `routes/dashboard/HMDashboard.tsx:304` | One realtime match tick re-renders all N cards, each re-running `Object.entries(derived_tags).filter().sort()` | medium |
| R3 | PostRole: ~50 useState in one 848-line comp; `JSON.stringify(collectDraft())` in effect **body** per keystroke | `routes/dashboard/PostRole.tsx:304` | Full-form reconcile of open sections + serialize per keystroke; input latency on mobile | medium |
| R4 | RestaurantProvider context value is a fresh object literal every render (no `useMemo`); `branch`/`employee` re-`.find()` | `lib/restaurant/context.tsx:134` | Any provider setState re-renders all `useRestaurant()` consumers (one mounted screen + layout, not all simultaneously) | medium |
| R5 | Cashier `EinvoiceBadge` 3s `setInterval` w/ edge-fn `triggerSubmit`, never backs off / never stops on terminal states | `routes/restaurant/Cashier.tsx:478` | Indefinite 3s edge-fn writes + DB reads per selected order; O(orders×tables) `.find` per search keystroke | medium |
| R6 | Floor 15s poll: full `refresh()` sets `loading=true` + replaces all arrays unconditionally; `onChanged` fresh closure | `routes/restaurant/Floor.tsx:40` | 3 round-trips + active-tab re-render every 15s even with zero changes (non-blocking; bounded by tablet count) | low |
| R7 | Admin/Floor/Cashier do `.find()` per row inside `.map` (N+1 lookups) | `routes/restaurant/Admin.tsx:244` | Quadratic over small domain data (tens–low-hundreds items); micro-cost, matters only coupled to R4 | low |

**Tempering:** R1/R2's "at millions of sessions" framing mis-casts a per-device client-CPU cost as additive scaling load — it is **orthogonal** to the nano write ceiling. R2's proposed per-card busy boolean would **regress** the intentional global in-flight lock (`disabled={actionBusy!==null}`) unless an `anyBusy` flag is threaded; the realtime-tick win needs only stable callbacks + memoised `feedbackEntry`. R4's cited "Floor 15s poll" trigger is wrong (Floor mutates local state, not provider) — real trigger is branch-switch `setEmployees`. R3's `stringify`/`.find` costs are sub-ms; the only material cost is the reconcile, fixed by **splitting sections into components**, not `React.memo` on `FormSection`.

### 2.3 Data Fetching

| # | Problem | File:line | Impact | Sev |
|---|---|---|---|---|
| D1 | Reports: `Promise.all(o.map(x => listOrderItems(x.id)))` after `listOrders(…,500)` — up to 500 concurrent PostgREST GETs per open | `routes/restaurant/Reports.tsx:61` | Saturates the small pool, queues every other tenant behind it; `select('*')` over-fetch. Correct shape = 1 query | **high** |
| D2 | Talent dashboard opens an **unfiltered** realtime sub on `interview_rounds` (whole `public` schema) | `routes/dashboard/talent/useTalentDashboardData.tsx:261` | Realtime evaluates RLS per-subscriber on every platform-wide insert; per-subscriber cost multiplier (RLS **does** scope delivery — no data leak/broadcast storm) | **high** |
| D3 | `useQuery` SWR layer bypassed by the high-fanout user dashboards (hand-rolled `useEffect`) | `lib/useQuery.ts:62` | Config/profile refetch on every mount + back-nav, no stale-while-revalidate. **Not dead code** (live in Kpi/Audit panels); genuine win is narrower than claimed | medium |
| D4 | Session bootstrap `profileById()` uses `select('*')` — pulls `interview_transcript` (full onboarding chat log) on every hydrate | `data/repositories/profiles.ts:22` | Tens of KB of unused JSON per cold load, then `JSON.stringify`'d into sessionStorage. Runs once/cold-load (**not** per re-warm — dedupe short-circuits) | medium |
| D5 | HM candidate list query has no `.limit()`/pagination; embeds talents+roles+match_feedback per row | `data/repositories/matches.ts:48` | Power HM/agency pulls hundreds–thousands of joined rows per mount; also oversizes the follow-up previews RPC id set | medium |
| D6 | HR dashboard boot is a 4-hop sequential waterfall (session→company→HMs→roles) before any parallelism | `routes/dashboard/hr/useHrDashboardData.tsx:69` | ~450–750ms serial latency before interview data starts (masked for returning users by localStorage snapshot) | medium |
| D7 | `role_id=in.(<all ids>)` realtime filter + HR `.in('role_id', roleIds)` with no cap | `routes/dashboard/hm/useHmDashboardData.tsx:341` | Latent 414 / Realtime filter-length cliff for enterprise/agency tenants (thousands of roles); invisible until crossed | medium |

**Tempering:** D2's "quadratic broadcast storm to millions" overstates — RLS scopes delivery and `interview_rounds` is low-cadence; the **safe** fix is per-match filtered channels (`filter: match_id=eq.X`) scoped to the few interview-stage matches, **not** dropping the sub (the matches UPDATE handler doesn't call `loadRounds`, so manager-created rounds would stop appearing live). D4's proposed 9-column projection is **unsafe** — it drops `consents`, `whatsapp_number`, `referral_code`, `display_name`, `locale`, etc. that the shared session object renders from; correct fix = select all ~23 declared columns and exclude **only** `interview_transcript` (+ internal cols). D5's naive `.limit(100)` would corrupt the localStorage aggregate counts — move counts to a head-count query when paginating.

### 2.4 Database / Supabase

| # | Problem | File:line | Impact | Sev |
|---|---|---|---|---|
| DB1 | Admin-KPI cron: ~10 aggregate scans incl. full `matches` `count(*) FILTER` scan, **every 2 min, 720×/day**, regardless of admin presence | `migrations/0160…:60` | Two true O(n) scans (all profiles + all matches) become a permanent CPU floor that scales with table size; the rest are index-backed | **high** |
| DB2 | `get_match_candidates` `ORDER BY feedback_score DESC LIMIT 500` walks the ordered btree + per-row JSONB filters, defeating the skills/language/atom GIN indexes | `migrations/0114…:232` (live body `0139:233`) | On selective roles at 1M talents this degrades from a 500-row read to a ~400k-row ordered scan; process-match-queue hot path | **high** |
| DB3 | `match-expire` warns/reminds with per-match N+1 (talent+role+HM lookups + per-row UPDATE) on the write path (Pass A/A2) | `functions/match-expire/index.ts:60` | Thousands of matches/run → tens of thousands of serial round-trips + single-row UPDATEs holding connections on nano (6h cron) | medium* |
| DB4 | 4 standalone `maybeSingle()` `system_config` reads per generation the batch already covers | `functions/_shared/match-core.ts:308` | 4 extra serial round-trips + connection checkouts per `matchForRole`, ×queue volume; zero need to be separate | medium |
| DB5 | `proactive-job-push` decrypts DOB + picks jobs one talent at a time (per-candidate N+1) — pattern 0166 already fixed in the matcher | `functions/proactive-job-push/index.ts:92` | 100k+ serialized round-trips at 50k candidates in one monthly edge invocation; contends with live traffic at 09:05 MYT | medium |
| DB6 | `request_dedup` (money-path idempotency) has expires_at index but **no purge cron** — grows monotonically | `migrations/0165…:46` | Unbounded heap/index/jsonb storage + autovacuum debt on nano (per-check latency stays O(log n) — storage, not speed) | medium |
| DB7 | Retention on append-mostly tables is DELETE-based, not partitioned | `migrations/0164…:30` | Highest-frequency write table (`notification_outbox`) churns dead tuples + WAL/locks on daily DELETE; autovacuum falls behind on nano | medium |
| DB8 | RLS helpers `hm_can_see_talent`/`talent_can_see_role` are per-row EXISTS over matches | `migrations/0014…:33` | Latent — any full-scan list surface becomes O(rows) 3-table EXISTS. **`hiring_managers(profile_id)` already indexed** (0123); mitigation is id-bounded lists, not the proposed indexes | low |

**Tempering:** DB1's "single biggest silent drain" is future-tense (0134 pegs current cost ~200–400ms) — real at millions-scale, negligible today. DB1 fix step 4 (single-row counters via transition triggers) trades scan cost for **row-lock contention** on the same write ceiling — keep it, but not free. DB2's example only makes `skills @>` GIN-sargable; the language `NOT EXISTS` predicate must also be rewritten to a containment form or `idx_talents_languages_gin` stays unused. *DB3 is the same defect as serverless S4 (high) — see §2.6; net severity **high**.*

### 2.5 Memory / Realtime

| # | Problem | File:line | Impact | Sev |
|---|---|---|---|---|
| M1 | KDS N+1 line-item fetch on a 5s poll — one query per active order, no diff vs prev tick | `routes/restaurant/Kds.tsx:47` | ≈360 order-item queries/min/screen at 30 orders, ×stations ×tenants; also refetches static menu every tick. Largest restaurant query amplifier | **high** |
| M2 | Kiosk/KDS/Cashier/Floor/Track/Purchasing pollers never pause on `document.hidden` | `routes/restaurant/Kds.tsx:57` | Standing REST-heavy load that never idles; **but** visibility-gating helps only backgrounded tabs — always-on foreground kiosks need idle/activity backoff. Cashier 3s write-poll is the sharpest sub-item | medium |
| M3 | `dashboardCache` localStorage entries accumulate per-userId with only lazy same-key TTL eviction | `lib/dashboardCache.ts:60` | On shared kiosks `dnj.dash:*` grows until QuotaExceededError (silently swallowed) breaks the current user's hydration + sb-/i18n writes. Slow tail | low |
| M4 | HM match-keyed maps (`roundsByMatch`, `proposalsByMatch`, `contactByMatch`, `feedbackState`) never pruned (Talent hook prunes) | `routes/dashboard/hm/useHmDashboardData.tsx:93` | Monotonic growth within one session; **retains revealed PII** for off-screen matches. Bounded per-session (unmount clears) — hygiene > perf | low |
| M5 | `inTabLock` discards `acquireTimeout` — a hung auth op wedges the whole chain | `lib/supabase.ts:30` | Liveness stall ("app frozen / isHM 0 rows") + retained queued closures. **Proposed race() fix is UNSAFE** (runs auth ops concurrently — the collision the lock prevents); correct fix rejects on timeout + per-refresh AbortController | low |
| M6 | No runtime cache route for lazy chunks globIgnored from precache | `src/sw.ts:34` | Returning-kiosk re-downloads Kds/Cashier/Floor chunks after HTTP-cache eviction. Bounded latency cost, no leak | low |

### 2.6 Serverless / Caching

| # | Problem | File:line | Impact | Sev |
|---|---|---|---|---|
| S1 | `match-expire` recipient resolution is per-match N+1 (Pass A/A2) with **no per-run `.limit()`** | `functions/match-expire/index.ts:60` | Recovery spike → tens of thousands of serial queries in one edge invocation; a mid-loop timeout **skips Pass B core expiry** (runs after the loops) | **high** |
| S2 | Delivery webhooks do 2N+2 synchronous inserts **inside the 5s Grab/FoodPanda/Shopee ack window** | `api/webhooks/grab.ts:58` | Large-basket + nano write-pressure tail breaches ack → platform retries race the in-flight insert; throughput capped by DB latency not concurrency | medium |
| S3 | Webhook order-item fan-out is a serial N+1 of single-row inserts (2 round-trips/line) | `api/webhooks/_lib.ts:126` | Latency ∝ basket size; holds a connection for the whole loop during bursts | medium |
| S4 | `match-expire` Pass B expires + history-logs an **unbounded** set in one statement | `functions/match-expire/index.ts:147` | If cron falls behind, one `UPDATE…RETURNING` locks a huge row set + materializes it in fn memory → timeout that worsens each failure | medium |
| S5 | `retry-stuck-extractions` runs inline serial rematch of up to 50 roles × 5 talents = 250 `matchForRole` per tick | `functions/retry-stuck-extractions/index.ts:113` | Duplicates the heavy scoring path off-queue; edge wall-clock + nano fan-out. Backstop cron (only fires on >10min-stuck rows) | medium |
| S6 | `/api/stats` uses `count=exact` + leading-wildcard `ILIKE '*talent*'` on profiles | `api/stats.ts:26` | Unindexable count re-runs per POP every 5 min for a social-proof number. **RLS on `profiles` blocks anon** → effectively returns 0 + planner gates on pkey, softening the worst case | medium |
| S7 | Webhook Supabase client re-created per invocation (no warm-instance reuse) | `api/webhooks/_lib.ts:22` | Tiny per-call alloc/CPU. **`createClient` opens NO connection** — the "connection churn" rationale is false; micro-tidy | low |
| S8 | 7 fixed OG images re-rendered by `@vercel/og` per cache-miss (no `immutable`) | `api/og.tsx:91` | Wasted edge WASM rasterization daily ×POP. Crawler-only, low volume | low |

**Cross-references / dedup:** S1 == DB3 (match-expire N+1) — one fix. M1 == D1-family (KDS/Reports N+1). D2 == the realtime `interview_rounds` finding (surfaced in 3 dimensions; net **high**).

**Refuted (checked & dismissed):** (a) "silo-data.ts dragged into main chunk" — the proposed leaf-slug split yields ~0 reduction because `Landing` statically imports the heavy records for JSON-LD; real fix is to precompute the JSON-LD, which the finding didn't propose. (b) "Every SEO view triggers a Supabase read" — **factually false**: those pages hit the DB zero times (grep = 0 `supabase|fetch|from(`); the proposed edge-fn fix would *introduce* a DB dependency and regress.

---

## 3. Optimization Strategies — 3 Waves

### Wave 1 — Quick, high-ROI (effort S, ship first)

| Item | What | Why / expected gain | Effort |
|---|---|---|---|
| D1 | Batch Reports line-items into one `.in('order_id', ids)` (chunk to ~100 ids to dodge URL limits) | 500 GETs → 1–5; unblocks the pool for other tenants | S |
| M1 | Batch KDS line-items into `listOrderItemsForOrders(ids)`; move static menu fetch out of the 5s poll | ~360 q/min/screen → ~12; strictly fewer, behaviour-identical | S |
| DB4 | Fold the 4 extra `system_config` keys into the existing `.in('key', WEIGHT_KEYS)` batch | 4 fewer round-trips per `matchForRole`, ×queue volume; behaviour-identical | S |
| DB6 | Add the daily `request_dedup` purge cron (mirror 0164 DO-block idiom) | Stops unbounded money-path table growth; trivial | S |
| S6 | `/api/stats` → `count=estimated`, raise `s-maxage` to 1800 + SWR | Removes the unindexable exact-count seq-scan per POP | S |
| S8 | OG images → `immutable` + build-version query param (or build-time pre-gen) | Removes daily edge re-rasterization | S |
| R5/R7 | `EinvoiceBadge` exponential backoff + stop on terminal states (re-arm on manual Retry); `Map<id,…>` indexes replacing render-loop `.find` | Stops indefinite 3s edge-fn writes; O(1) lookups | S |
| B6 | Optimise `og-image.png` (oxipng/pngquant, keep PNG) → <80KB | CDN egress + share-preview latency | S |

### Wave 2 — Medium structural

| Item | What | Why / expected gain | Effort |
|---|---|---|---|
| B2 | i18n → `i18next-resources-to-backend`, bundle only `en`, lazy `ms`/`zh` (`useSuspense:false`) | −30–40KB gzip + no `JSON.parse` of 158KB unused strings on every cold load | M |
| B3 | Lazy Supabase client + idle-defer `bootstrapSession()` so static routes never eval it | −50KB gz + no GoTrue/realtime setup on anonymous SEO/bounce pages | M–L |
| D4 | Narrow `profileById` to all ~23 declared cols **excluding `interview_transcript`** (+ internal) | Drops tens of KB unused JSON per cold hydrate + sessionStorage write | S |
| D2 | Replace unfiltered `interview_rounds` sub with per-match filtered channels (`match_id=eq.X`) for interview-stage matches | Pushes the filter to Realtime/WAL; kills per-subscriber RLS fan-out without losing live rounds | M |
| D5 | `.limit(100)` + `range()` pagination on HM candidates; move aggregate counts to a head-count query; cap preview id set to the page | Bounds payload/memory/RPC size for power HMs | M |
| D6 | Collapse HR company→HMs→roles into one `SECURITY DEFINER` RPC (auth-check internally, `EXECUTE` to authenticated only) | −2 RTTs of serial boot latency | M |
| R1 | Narrow-selector every `useSession()` call (+ `useShallow` for multi-field) | Auth heartbeats stop re-rendering the route tree | M |
| R2/R3/R4 | Stable `useCallback` id-handlers + memoised `feedbackEntry` (R2); split PostRole sections + `stringify` inside the debounce (R3); `useMemo` the context value + split rarely/frequently-changing contexts (R4) | Removes per-tick / per-keystroke reconcile cascades | M |
| M2 | Shared `usePolling(fn, ms)` hook: visibility-gate **plus** idle/activity backoff (foreground kiosks never go hidden) | Cuts night/idle poll load; Cashier 3s write-poll is the priority | M |
| S1/DB3 | `match-expire` Pass A/A2 → one join query for recipients + bulk `UPDATE … WHERE id = ANY`; fan notify with `Promise.allSettled`; `.limit()` per pass (widen Pass A warn band so deferred rows aren't missed) | Set-based; bounds the run; removes N+1 connection hold | M |
| S2/S3 | Webhooks → enqueue raw payload into `webhook_inbox` (unique on `(platform, external_order_id)`) + ack <50ms; drain with a **high-frequency/Realtime-triggered** worker (kitchen visibility is latency-critical); bulk-insert order_items + kitchen_tickets | Decouples platform SLA from DB latency; retries become idempotent no-ops | L |
| S4 | Pass B → claiming RPC (`LIMIT … FOR UPDATE SKIP LOCKED`), loop K batches, per-batch history insert | Each invocation O(batch), not O(backlog) | M |
| S5 | `retry-stuck-extractions` → `enqueue_roles_for_rematch` + let `process-match-queue` drain | Extraction cron stays O(BATCH_SIZE), off the scoring path | M |
| DB5 | `proactive-job-push` → set-based `get_nudge_age_weights(ids[])` RPC (mirror 0166, byte-identical age curve) + bounded `Promise.allSettled` notify | Removes per-candidate decrypt/pick N+1 | M |
| DB1 | Admin-KPI cron → 15-min cadence (or on-demand when panel opens); `reltuples` for the two big unfiltered denominators; keep index-backed exact counts | Removes the every-2-min full-scan CPU floor | M |

### Wave 3 — Strategic / architectural

| Item | What | Why / expected gain | Effort |
|---|---|---|---|
| B1 | **SSG/ISR the public silo/careers routes.** Prerender the static content island via `vite-react-ssg` (not full `<App/>` `renderToString` — hydration-mismatch risk), hydrate the SPA on top | Sub-1s LCP on the SEO/paid-traffic landing pages; the single biggest business lever | L |
| DB2 | Two-phase `get_match_candidates`: `MATERIALIZED` survivor CTE (GIN bitmap AND over selective predicates) → then `ORDER BY … LIMIT` over the small set; also rewrite the language `NOT EXISTS` to a containment form | Restores GIN usage on the match-generation hot path at 1M talents | M |
| DB7 | Execute the documented partition cutover: `notification_outbox`/`audit_log`/`match_history` → `PARTITION BY RANGE(created_at)`, retention = `DROP/DETACH PARTITION` (re-apply RLS + grants — `INCLUDING ALL` doesn't carry policies) | O(1) metadata retention; removes DELETE-churn/vacuum pressure on the hottest write table | L |
| M5 | Fix `inTabLock`: **reject** queued callers on `acquireTimeout` (stock semantics) + per-refresh `AbortController` fetch timeout — do **not** `Promise.race` fn ahead of the holder | Removes the auth-freeze liveness stall safely | S |
| — | **Supabase tier + pooling** (see §5) | The actual millions ceiling | — |

---

## 4. Improved Production-Ready Code (top ~8 leverage points)

**4.1 KDS / Reports N+1 → single batched query (M1, D1)**
```ts
// lib/restaurant/store.ts
export async function listOrderItemsForOrders(orderIds: string[]): Promise<OrderItem[]> {
  if (orderIds.length === 0) return []
  // chunk to avoid ~18KB GET URL / PostgREST URL limits on large id sets
  const chunks: string[][] = []
  for (let i = 0; i < orderIds.length; i += 100) chunks.push(orderIds.slice(i, i + 100))
  const results = await Promise.all(chunks.map(ids =>
    db.from('order_item')
      .select('id, order_id, menu_item_id, quantity, status, special_instruction, modifier_ids')
      .in('order_id', ids)))
  return results.flatMap(r => (r.data ?? []) as OrderItem[])
}
// Kds.tsx:47 — replace Promise.all(ids.map(listOrderItems)):
const all = ids.length ? await listOrderItemsForOrders(ids) : []
if (alive) setOrderItems(all)
// + move listMenuItems(branchId) into a one-time effect, NOT the 5s poll.
```

**4.2 i18n — ship only the detected locale (B2)**
```ts
// lib/i18n.ts
import resourcesToBackend from 'i18next-resources-to-backend'
import en from '../locales/en.json'
void i18n
  .use(LanguageDetector)
  .use(resourcesToBackend((lng: string) =>
    lng === 'en' ? Promise.resolve({ default: en }) : import(`../locales/${lng}.json`)))
  .use(initReactI18next)
  .init({
    partialBundledLanguages: true,
    resources: { en: { translation: en } },   // en stays for first paint
    fallbackLng: 'en',
    react: { useSuspense: false },             // avoid flash on switch to unloaded locale
  })
// ms.json + zh.json (~158KB raw) leave the entry chunk; each becomes an on-demand chunk.
```

**4.3 Lazy Supabase client + idle-deferred bootstrap (B3)**
```ts
// lib/supabase.ts — lazy singleton so static routes never eval @supabase/supabase-js
let _c: SupabaseClient | null = null
export const getSupabase = async () =>
  (_c ??= (await import('@supabase/supabase-js')).createClient(URL, KEY, opts))
// main.tsx — defer session bootstrap off the critical path
const boot = () => import('./state/useSession').then(m => m.bootstrapSession())
;(window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1)))(boot)
// Silo/Landing must call getSupabase() only inside effects, never at import time.
```

**4.4 Session profile projection — exclude only the heavy blob (D4, corrected)**
```ts
// data/repositories/profiles.ts — keep every column the shared session object renders,
// drop ONLY interview_transcript (+ internal: consent_ip_hash, diamond_points,
// email_bounced, deleted_at, onboarding_reminder_*). Do NOT shrink to 9 columns.
const SESSION_PROFILE_COLS =
  'id, email, full_name, display_name, role, points, is_banned, onboarding_complete, ' +
  'ghost_score, phone, consents, consent_version, whatsapp_number, whatsapp_opt_in, ' +
  'referral_code, locale, waitlist_approved'
export function profileById(userId: string) {
  return supabase.from('profiles').select(SESSION_PROFILE_COLS).eq('id', userId)
}
// Onboarding-resume keeps its own narrow query (profileOnboardingDraftById) for interview_transcript.
```

**4.5 Filtered realtime for interview_rounds — keep live, drop the fan-out (D2)**
```ts
// per-match filtered channels for the few interview-stage matches (push filter to Realtime/WAL):
interviewMatchIds.forEach(mid => channel.on('postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'interview_rounds', filter: `match_id=eq.${mid}` },
  (p) => {
    const r = p.new as InterviewRound & { match_id: string }
    setRoundsByMatch(prev => prev[r.match_id]
      ? { ...prev, [r.match_id]: prev[r.match_id].some(x => x.id === r.id)
          ? prev[r.match_id] : [...prev[r.match_id], r] }   // dedup on reconnect replay
      : prev)
  }))
```

**4.6 match-expire Pass A/A2 — set-based recipients + bulk stamp (S1/DB3)**
```sql
-- one round-trip for recipients instead of 3N
select m.id as match_id, t.profile_id as talent_pid, hm.profile_id as hm_pid
from matches m
join talents t on t.id = m.talent_id
join roles r  on r.id = m.role_id
join hiring_managers hm on hm.id = r.hiring_manager_id
where m.status = any($1) and m.expiry_warning_sent_at is null
  and m.expires_at between $2 and $3
order by m.expires_at
limit 500;                                   -- bound the run (widen warn band so deferred rows aren't lost)
-- one bulk stamp instead of N single-row updates
update matches set expiry_warning_sent_at = now() where id = any($ids);
```

**4.7 get_match_candidates — GIN-first, then order+limit (DB2)**
```sql
WITH survivors AS MATERIALIZED (          -- optimization barrier forces GIN bitmap AND
  SELECT t.id, t.feedback_score
  FROM talents t JOIN profiles pr ON pr.id = t.profile_id
  WHERE t.is_open_to_offers
    AND NOT pr.is_banned
    AND (t.profile_expires_at IS NULL OR t.profile_expires_at >= now())
    AND (p_required_skills IS NULL OR t.skills @> p_required_skills)                       -- GIN
    AND (p_employment_type IS NULL OR t.employment_type_preferences @> ARRAY[p_employment_type]) -- GIN
    -- rewrite the language NOT EXISTS to a containment form so idx_talents_languages_gin is usable
)
SELECT id AS talent_id FROM survivors
ORDER BY feedback_score DESC NULLS LAST
LIMIT p_limit;                            -- sort now over the small survivor set, not ~400k rows
```

**4.8 Webhook enqueue-and-ack + inbox purge (S2/S3, DB6)**
```ts
// grab.ts — verify HMAC, then a single idempotent enqueue; ack in <50ms.
const { error } = await inboxDb().from('webhook_inbox').insert({
  platform: 'grab', external_order_id: payload.orderID ?? payload.id,
  branch_id: branchId, raw: payload, status: 'pending',
})                                        // unique(platform, external_order_id) => retries are no-ops
if (error && error.code !== '23505') console.error(error)
return json({ success: true })            // a Realtime-triggered worker runs insertDeliveryOrder off the ack path
```
```sql
-- request_dedup daily purge (mirror 0164 idiom)
do $$ begin
  if exists (select 1 from cron.job where jobname='dnj-purge-request-dedup-daily')
    then perform cron.unschedule('dnj-purge-request-dedup-daily'); end if;
  perform cron.schedule('dnj-purge-request-dedup-daily','20 3 * * *',
    $job$ delete from public.request_dedup where expires_at < now(); $job$);
end $$;
```

---

## 5. Scalability Recommendations — the path to millions

**5.1 Supabase write-path & connection ceiling (the real bottleneck).**
- **Front every serverless/edge caller with the pooler** (Supavisor/PgBouncer transaction mode) and confirm cron/edge functions reuse it — the nano/micro connection cap, not CPU, is what breaks first. S7's client-reuse is cosmetic; **connection strategy is the lever.**
- **Eliminate standing pollers → Realtime or event-driven.** KDS/Floor/Cashier pollers (M1, M2, R5, R6) are a per-tenant, per-screen query floor that never idles. Prefer filtered Realtime channels (branch-scoped) + a light local clock for age displays.
- **Batch/queue every fan-out job.** `match-expire`, `proactive-job-push`, `retry-stuck-extractions`, delivery webhooks all follow the `match_queue`/`enqueue_roles_for_rematch` pattern the codebase already proved. Rule: **no per-row N+1, no unbounded per-run set** on any cron/edge path; every job is O(batch) with `FOR UPDATE SKIP LOCKED`.
- **Watch the queue trade-offs:** single-row counter tables (DB1 step 4) and inbox drains re-introduce lock contention / kitchen-visibility latency — pair inbox with a Realtime-triggered worker, not a minute cron.

**5.2 Caching / CDN.**
- **Rendering strategy: CSR → SSG/ISR for public routes (B1).** Silo/careers content is a pure function of `silo-data.ts` — prerender at build (`vite-react-ssg`), hydrate on top. Keep dynamic app chrome CSR.
- **Immutable, long-TTL on content-fixed edge assets** (OG images with a build-version param, static og-image, fonts). Long `s-maxage` + SWR on `/api/stats` so a cold POP never blocks on Postgres.
- **Durable SW cache** for the globIgnored lazy chunks (M6) so kiosks stay offline-fast after HTTP-cache eviction.

**5.3 Queue / batch patterns.** Standardise: (a) `.in(col, ids)` chunked to ~100 for reads; (b) bulk `insert([...])` + bulk `UPDATE … WHERE id = ANY` for writes; (c) idempotent inbox for external webhooks; (d) `enqueue → process-match-queue` for anything that calls `matchForRole`.

**5.4 Database housekeeping at scale.** Partition the append-mostly tables (DB7); `reltuples` for non-exact denominators (DB1); purge the idempotency store (DB6); GIN-first candidate matching (DB2). These convert scale-linear costs into O(1)/metadata operations.

**5.5 Observability & budgets.**
- **Performance budgets in CI:** entry chunk gzip (fail if it regrows after B2/B3), LCP on the prerendered silo pages, per-route chunk sizes.
- **DB budgets:** alert on cron wall-clock (match-expire/process-match-queue), pooler connection saturation, autovacuum lag on `notification_outbox`, and slow-query log for `get_match_candidates`. The `/api/health` dead-man already shortens silent-death windows — extend it to cover queue drain lag.
- **Enable the deferred Sentry** with performance tracing on the match-generation and webhook-ack paths specifically.

**5.6 Load-test / monitoring plan.**
1. **Restaurant burst test:** N branches × M KDS/Cashier screens polling — measure PostgREST req/min and pooler saturation **before vs after** M1/M2 batching (expect ~10–30× reduction).
2. **Match-generation soak:** seed 1M talents / 400k open, drive `process-match-queue` at target throughput, capture `get_match_candidates` p95 before/after the survivor-CTE (DB2).
3. **Cron recovery drill:** pause `match-expire` to build a backlog, then confirm the batched/`LIMIT`ed version (S1/S4) completes within edge wall-clock and doesn't cascade.
4. **Webhook SLA test:** replay large-basket Grab/Shopee payloads under nano write pressure; confirm <50ms ack post-inbox (S2) and idempotent retry behaviour.
5. **Cold-mobile CWV (4G, mid-tier Android):** LCP/TTI on `/careers` + a silo page before/after SSG (B1) and the bundle trims (B2/B3).

---

## 6. Prioritized Checklist

| # | Item | Dimension | Effort | Expected gain |
|---|---|---|---|---|
| 1 | KDS N+1 → batched `.in()` + menu out of poll (M1) | Data/Memory | S | ~360→~12 q/min/screen; largest restaurant query cut |
| 2 | Reports 500-concurrent → single `.in()` (D1) | Data | S | 500→1–5 GETs/open; unblocks pool |
| 3 | Fold 4 `system_config` reads into batch (DB4) | Database | S | −4 RTTs per `matchForRole` ×queue volume |
| 4 | `EinvoiceBadge` backoff + stop on terminal (R5) | React | S | Ends indefinite 3s edge-fn writes |
| 5 | Add `request_dedup` purge cron (DB6) | Database | S | Stops unbounded money-path table growth |
| 6 | `/api/stats` `count=estimated` + SWR (S6) | Serverless | S | Kills per-POP unindexable count scan |
| 7 | OG images `immutable`/build-gen (S8); og-image optimise (B6) | Serverless/Assets | S | Removes daily WASM re-render; −250KB scrape |
| 8 | Narrow `profileById` (exclude `interview_transcript` only) (D4) | Data | S | −tens of KB per cold hydrate + sessionStorage |
| 9 | i18n: bundle `en`, lazy `ms`/`zh` (B2) | Assets | M | −30–40KB gzip + no 158KB `JSON.parse` cold |
| 10 | Lazy Supabase client + idle bootstrap (B3) | Assets | M–L | −50KB gz on anonymous SEO routes |
| 11 | Filtered `interview_rounds` realtime channels (D2) | Data/Realtime | M | Kills per-subscriber RLS fan-out, keeps live |
| 12 | `useSession` narrow selectors + `useShallow` (R1) | React | M | Auth heartbeats stop re-rendering route tree |
| 13 | HM cards: stable callbacks + memo `feedbackEntry` (R2); PostRole section split (R3); context `useMemo` (R4) | React | M | Removes per-tick/per-keystroke reconcile |
| 14 | `usePolling` visibility + idle backoff hook (M2) | Memory/Realtime | M | Cuts idle/backgrounded kiosk load |
| 15 | `match-expire` Pass A/A2 set-based + `.limit()` (S1/DB3) | Serverless/DB | M | Bounds run; removes N+1 connection hold |
| 16 | `match-expire` Pass B claiming RPC batches (S4) | Serverless | M | O(batch) not O(backlog); no recovery blowup |
| 17 | `proactive-job-push` batched age RPC (DB5); `retry-stuck-extractions`→enqueue (S5) | DB/Serverless | M | Removes monthly/backstop fan-out |
| 18 | Admin-KPI cron → 15-min/on-demand + `reltuples` (DB1) | Database | M | Removes per-2-min full-scan CPU floor |
| 19 | HM candidate list `.limit()`+pagination (D5); HR bootstrap RPC (D6); `role_id in()` server-side scope (D7) | Data | M | Bounds payloads; −2 boot RTTs; 414 cliff averted |
| 20 | Webhooks → inbox enqueue-and-ack + bulk insert (S2/S3) | Serverless | L | Decouples ack SLA from DB; idempotent retries |
| 21 | **SSG/ISR public silo/careers routes** (B1) | Assets | L | Sub-1s LCP on SEO/paid landing pages |
| 22 | `get_match_candidates` survivor-CTE + GIN (DB2) | Database | M | Restores GIN on match-gen hot path at 1M |
| 23 | Partition append-mostly tables (DB7) | Database | L | O(1) retention; removes vacuum/WAL churn |
| 24 | `inTabLock` reject-on-timeout + AbortController (M5) | Memory | S | Removes auth-freeze liveness stall (safely) |
| 25 | Low-priority polish: fonts preload (B5), font-subset glob (B4), SW chunk cache (M6), dashboardCache sweep (M3), HM map prune/PII (M4), render-loop Maps (R7), warm webhook client (S7), es2022 (B7) | Mixed | S | Incremental; ship opportunistically |

**Sequencing:** rows 1–8 are same-day, zero-regression wins that immediately relieve the connection-limited tier. Rows 9–19 are the structural middle. Rows 20–23 are the architectural bets that actually unlock millions (SSG for SEO/LCP, GIN-first matching, partitioned retention, pooler strategy). Treat **B1 (SSG)** and the **connection/pooler strategy** as the two decisions that most determine whether the platform holds at scale.