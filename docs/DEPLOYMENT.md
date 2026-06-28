# Diamond & Jeweler — Deployment, CI/CD & Operations

_The "senior DevOps engineer prepares this for production" deliverable for DNJ. Grounded in the live pipeline as of 2026-06-27. Companion to [ARCHITECTURE.md](./ARCHITECTURE.md), [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md), [OWNER_ACTIONS.md](./OWNER_ACTIONS.md)._

> **Why no Docker / Kubernetes here:** DNJ is **serverless** — Vercel edge functions + Supabase managed Postgres/Auth/Storage + Deno edge functions. There are no containers or pods to orchestrate; the "infrastructure" is platform configuration (Vercel project, Supabase project, pg_cron jobs, env/Vault secrets). The container-orchestration parts of a generic DevOps checklist are intentionally N/A; what matters here is **deploy coordination across three planes, secret/cron reliability, and monitoring** — covered below.

---

## 1. Deployment architecture — three planes, three triggers

| Plane | What | Trigger today | Source of truth |
|---|---|---|---|
| **Frontend** | SPA + `/api/*` + `middleware.ts` | **auto** — push to `main` → Vercel Git build (org `diamondandjeweler-cloud`, project `bole`) | `apps/web/` |
| **Database** | 186 migrations, RPCs, RLS, pg_cron | **manual** — Management API SQL / dashboard (not `db push`, due to tracking drift) | `supabase/migrations/` |
| **Edge functions** | 48 Deno functions | **manual** — `supabase functions deploy <name>` (config.toml pins `verify_jwt`) | `supabase/functions/` |

**Verify a frontend deploy:** `curl -s https://diamondandjeweler.com/version.txt` → the git short SHA. **Verify an edge deploy:** the function `version` increments + `status:ACTIVE` (Management API). **Verify a DB change:** query the object back.

⚠️ **This is split-brained** (frontend auto, backend manual) — the #1 DevOps risk. A push that changes a React caller *and* its edge function ships them on two unsynchronized tracks. Mitigation roadmap in §6.

---

## 2. CI/CD pipeline (`.github/workflows/ci.yml`)

Runs on every push + PR. Six jobs:

| Job | Gate | Blocking? |
|---|---|---|
| **web** | typecheck + lint + test (vitest) + build | ✅ |
| **e2e** | Playwright smoke (no-backend) | ✅ |
| **migrations** | SQL numbering + **no new duplicate prefixes** | ✅ |
| **db-apply** | `supabase db reset` (replays ALL 186 to ephemeral PG) → **column-isolation gate** → RLS invariant suite → schema lint | column-isolation ✅ **blocking**; RLS suite advisory* |
| **secrecy** | grep user-visible surfaces for forbidden BaZi terms | ✅ |
| **security** | `npm audit` (high+) + gitleaks secret scan | audit non-blocking; gitleaks ✅ |

`*` The fixtured RLS suite is `continue-on-error` until a green reset run is observed; the **fixture-free column-isolation gate is already blocking** (it guards the 3×-recurring PII/IP leak).

**The gap CI does NOT cover:** it validates a *fresh* migration apply but never (a) deploys edge functions, (b) `deno check`s them, (c) diffs repo-vs-prod migration state, or (d) gates the Vercel prod promotion on CI going green. These are the §6 hardening items.

---

## 3. Async / scheduled workloads (pg_cron → pg_net → edge)

~30 pg_cron jobs invoke edge functions via `net.http_post` with a `Bearer <vault service_role_key>`. Critical ones:

| Job | Cadence | Function |
|---|---|---|
| `bole-process-match-queue-every-1m` | 1 min | process-match-queue (drains `match_queue`) |
| `bole-match-expire-every-6h` | 6 h | match-expire |
| `refresh-admin-kpis-mv` | 2 min | (inline SQL — KPI cache) |
| `bole-data-retention-daily` | daily | data-retention (PDPA) |
| `bole-cron-deadman-daily` | daily | cron_deadman_check (watchdog) |
| `warmup-*` | 15 min | keep money/auth functions warm |

**Reliability invariant:** every cron-invoked worker writes `public.cron_heartbeat` on completion. A stale heartbeat = the cron→edge path is broken.

> **Lesson burned in (2026-05-30 → 06-27):** a rotated service-role key left the Vault `service_role_key` stale → every cron→edge call 403'd → the match pipeline was **dead for 27 days** and the only alert was in-app. **Root cause + fix in [OWNER_ACTIONS.md](./OWNER_ACTIONS.md).** This is why monitoring (§4) is now external-facing.

---

## 4. Monitoring & logging strategy

**Shipped:**
- **`/api/health`** → returns **503 when the most recent `cron_heartbeat` is >10 min stale** (or Supabase is unreachable), 200 when alive. Backed by the anon-safe `pipeline_health()` RPC. **Point a free external monitor (UptimeRobot / cron-job.org / Better Uptime) at `https://diamondandjeweler.com/api/health`** — this is the cure for "silent for 27 days."
- **`cron_heartbeat`** table + **dead-man check** (`cron_deadman_check`, migrations 0151/0154) — detects stalled crons.
- **Client errors → Sentry** (`@sentry/react` in `main.tsx`).
- **`net._http_response`** — pg_net records every cron→edge HTTP status (the definitive cron-success signal; 4xx/5xx here = pipeline trouble).
- **Migration drift detector** — `node scripts/check-migration-drift.mjs` (prod `schema_migrations` vs repo files).

**Gaps (tracked):**
- Edge functions emit **no structured error telemetry** to Sentry (only Supabase's own logs); client Sentry ships **no source maps** (minified stacks).
- The dead-man alert is **in-app only** — escalate it off-platform (Resend/Slack) so it reaches a logged-out human. (The external `/api/health` monitor is the pragmatic stopgap.)

---

## 5. Production deployment checklist

**Per release (frontend):**
- [ ] `npm run typecheck && npm run test:run && npm run build` green locally (lefthook enforces on commit)
- [ ] If edge functions changed: `supabase functions deploy <name>` **and** confirm `verify_jwt` unchanged
- [ ] If migrations added: apply via Management API; re-run a `supabase db reset` mentally/locally to confirm fresh-apply order
- [ ] Push → confirm `version.txt` flips to the new SHA
- [ ] `curl /api/health` → 200

**Pre-public-launch (one-time):**
- [ ] 🔴 Vault `service_role_key` current (revives the pipeline) — `/api/health` green
- [ ] External uptime monitor on `/api/health`
- [ ] Billplz webhook signature secret set (live payments)
- [ ] Admin MFA decision (TOTP vs OAuth-only)
- [ ] Reconcile `schema_migrations` before ever using `db push`
- [ ] Supabase compute tier load-tested (the documented nano-tier 521 SPOF)
- [ ] Pin Vercel function region to the Supabase region; document single-region as a chosen constraint
- [ ] Flip the RLS suite to blocking once a green reset run is observed
- [ ] Source-map upload in the build + edge error telemetry

---

## 6. Recommended CI/CD hardening (to close the split-brain)

1. **Edge-deploy job** — GitHub Action on push-to-`main` (or manual-approval) running `supabase functions deploy` for changed functions, using a `SUPABASE_ACCESS_TOKEN` repo secret. At minimum, a `deno check` job so CI validates edge functions.
2. **Migration-drift gate** — wire `scripts/check-migration-drift.mjs` into CI (with the token secret) so prod-vs-repo divergence is visible; reconcile `schema_migrations` first.
3. **Gate prod promotion on CI** — Vercel "Required Checks" / Git Checks so a red `web`/`db-apply`/`security` run blocks the prod deploy.
4. **Wire `qa/run.mjs`** (21-check readiness harness) into CI.
5. **Flip the RLS suite to blocking** + escalate the dead-man off-platform.

---

## 7. Rollback

See [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md). Summary: **frontend** — Vercel "Promote to Production" on a prior deployment (or revert the commit; Git auto-redeploys). **Edge** — `supabase functions deploy` the prior version from git. **DB** — Supabase PITR (project-wide; there is no per-table restore — so test destructive migrations on a `db reset` first; this raises the blast radius of a bad migration, an argument for the drift gate + partitioning hot tables as data grows).
