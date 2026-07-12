# DNJ Audit Coverage Checklist — 2026-07-11

**Question answered:** you ran 10 senior-engineer audit sessions (architecture, reverse-engineer, debugging, performance, clean-arch, infra/scale, UI, tech-lead, security, DevOps). How much of the project did they actually audit, and how much of what they found actually shipped?

**Method:** 22 verification agents worked read-only against **`origin/main` @ `1121a08`** (the local working tree is 24+ commits behind — do not trust it for status). Every claim below is grounded in a commit hash, migration file, or doc on the remote; every finder report was adversarially re-checked by a skeptic agent. Session memories were treated as hints only — several turned out stale (see §3).

---

## 1. Scoreboard

| # | Session theme | Audited? | Findings executed? | Score /100 |
|---|---|---|---|---|
| S1 | Greenfield system architecture | ✅ FULL | ✅ Executed & verified | **84** |
| S2 | Reverse-engineer + refactor | ✅ FULL | 🟡 Executed partial | **85** |
| S3 | Production debugging / RCA | ✅ FULL | 🟡 Executed partial | **82** |
| S4 | Performance for millions | ✅ FULL | 🟡 Executed partial | **76** |
| S5 | Clean architecture | ✅ FULL | 🟡 Executed partial | **85** |
| S6 | Infrastructure & scale | ✅ FULL | 🟡 Executed partial | **85** |
| S7 | Frontend UI system | ✅ FULL | ✅ Executed & verified | **85** |
| S8 | Tech-lead review | ✅ FULL | 🟡 Executed partial | **76** |
| S9 | Security audit | ✅ FULL | ✅ Executed & verified | **87** |
| S10 | DevOps / deployment | ✅ FULL | 🟡 Executed partial | **74** |

### **Overall: ~82/100 audited-and-executed.**

**Verdict:** all 10 dimensions were genuinely audited — with real findings artifacts, not just chat — and the majority of P0/critical findings verifiably shipped to `origin/main`. What keeps this from ~95: (a) a consistent pattern of **owner-gated actions never confirmed** (uptime monitor, secrets, prod reconciliation, lawyer sign-off), (b) the **big-effort perf/infra levers deferred** (SSG, lazy Supabase client, webhook inbox, partitioning), and (c) **4 whole areas no session ever touched** (§5).

---

## 2. Per-session checklists

### S1 — Greenfield system architecture — 84/100
**Done (verified on origin/main):**
- [x] As-built architecture doc: 3-plane diagram, file structure, 62-table schema, API surface, UI arch, data flow — `docs/ARCHITECTURE.md` (8978c3b)
- [x] "Compare with what exists" scorecard: minimal 42/100, scalable 68/100, Restaurant-OS scope-creep quantified — `AUDIT.md` (repo root)
- [x] All regular matcher lanes routed async through `match_queue` (the only outage-class ceiling) — 4bbbb8d; verified live in `match-generate/index.ts:136`
- [x] Match-kick error contract restored after async routing — 1c0d1fa
- [x] Migrations 0179/0180/0181: HR-email normalization + queue priority escalation + fail-closed HR binding + last raw RLS policies normalized
- [x] Retry-After on every 429, epoch-aligned true remaining window — 262eb50, 0755ce4
- [x] Client error-envelope guardrail + API routing invariant codified — e592794, `AGENTS.md:88-96`
- [x] Domain-boundary lint: `lib/api` banned from pure domain — 5f8294a, `eslint.config.js:198`
- [x] Edge observability speaks Sentry — de94d89 (**inert until secret set**, see §6)

**Open:**
- [ ] **P1** `SENTRY_DSN_EDGE` secret not set — telemetry inert (owner)
- [ ] **P1** No external uptime monitor on `/api/health` confirmed (owner)
- [ ] **P2** Target-architecture dossier never committed (`docs/ARCHITECTURE_TARGET.md` offered, not created — lives only in a chat artifact)
- [ ] **P2** `notification_outbox` (0085) still unwired — zero writers, no drain
- [ ] **P2** 22 duplicate migration numeric prefixes break CI's ephemeral-Postgres replay
- [ ] **P3** `docs/ARCHITECTURE.md` stale (says 186 migrations/0162; actual 215/0190)

**Never examined:** multi-region/DR failover, infra-as-code, load-tested capacity numbers, cost modeling, Restaurant-OS isolation, API versioning.

### S2 — Reverse-engineer + refactor — 85/100
**Done:**
- [x] Three stacked reverse-engineering audits with file:line findings: `AUDIT.md` (06-17), `docs/AUDIT_2026-06-27.md`, `docs/ARCHITECTURE.md`
- [x] Repository data-access seam COMPLETE: 149 raw `supabase.from()` call sites → 0 outside `data/repositories` (31 repo modules), lint-enforced at error
- [x] Pure domain layer extracted (8 modules in `shared/domain/`) with lint-enforced purity — 552d48a, d3e9c6d
- [x] God-components halved+: HMDashboard 1619→595, TalentOnboarding 1553→698, TalentDashboard 1342→451
- [x] Route-guard composition + characterization test (`app/routing/guards/`) — 73fab1c, f5ee65c
- [x] Route-topology drift guard test — 85de22c
- [x] Generated DB types committed + adopted (12 repos, ~25 callers) — 0d6a327, 47c17c9
- [x] Duplicate logic enumerated and largely deduped (route topology ×5, order-total ×6, matcher byte-copy)
- [x] Behavior-preservation gates recorded per commit (tsc, eslint, 371 vitest, build)

**Open:**
- [ ] **P1** Backend-seeded e2e test infra (the declared blocker for all "red track" rewrites) never built
- [ ] **P2** `match-core.ts` still a 1,322-line god-file (only 9 pure scorers extracted)
- [ ] **P2** P7 Restaurant bounded-context extraction deferred (seam-guard exemption in place)
- [ ] **P3** dependency-cruiser import-graph gate never landed

### S3 — Production debugging / RCA — 82/100
**Done:**
- [x] 2026-07-10 white-screen outage: root cause traced to 7 Radix transitive React-coupled packages in wrong vendor chunk; fixed — b91bea7 / PR #31
- [x] 27-day dead match pipeline root-caused (rotated key vs stale Vault secret) — 117594f
- [x] 3-layer pipeline monitoring: `pipeline_health()` RPC + `/api/health` 200/503 (0161) + failure-ratio "degraded" (0163) + per-job liveness (0178, PR #28)
- [x] `[object Object]` edge-error leak fixed with 6 unit tests — e592794
- [x] May-2026 bug backlog fully triaged; `bugs-outstanding` doc marked SUPERSEDED (only F-06 carried forward)
- [x] match-expire false-dead-man edge case fixed (heartbeat at start of run)

**Open:**
- [ ] **P1** No regression test/CI guard for the vendor-chunk outage class (fix is a hand-enumerated package list)
- [ ] **P1** External uptime monitor unconfirmed — the whole monitoring stack pages nobody
- [ ] **P2** `cron_deadman_check` alerts in-app only (a dead cron silences its own watchdog)
- [ ] **P2** No automated tests for the restored match-kick error contract
- [ ] **P2** F-06 email-verification inbox certification open since 2026-05-16
- [ ] **P3** No postmortem doc for the 07-10 outage (RCA lives only in the commit message)

### S4 — Performance — 76/100
**Done:**
- [x] Restaurant N+1: Reports ~500 GETs→1-5, KDS ~360 q/min→~12 — 29a2f5a (PR #19)
- [x] `get_match_candidates` GIN-first CTE, proven set-equivalent, applied to prod — 0172 (PR #24)
- [x] match-expire N+1 → batched claim-then-update, bounded 500/pass — f9461ed (PR #23)
- [x] Admin-KPI MV refresh 720×/day → */15min (~7.5× CPU floor cut) — 0171 (PR #22)
- [x] i18n lazy locales (~158KB off entry path) — e62d984 (PR #20)
- [x] Nudge decrypt N+1 → one batched RPC — 2fd0fd0 + migration 0182 (PR #30)
- [x] Shared `usePolling` (visibility-gate + idle backoff) — PR #21; `useShallow` selectors ~18 files; realtime server-side filters; `inTabLock` acquireTimeout; SW runtime-cache for lazy chunks; prerendered silo article visible (PR #29/#30)

**Open (the big levers were NOT shipped):**
- [ ] **P1** B3 — lazy Supabase client on anonymous SEO routes (still eager `createClient` at module scope)
- [ ] **P1** B1 — full SSG/ISR of public routes ("single biggest business lever"; only the small visibility fix shipped)
- [ ] **P1** S2/S3 — webhook inbox enqueue-and-ack (Grab/FoodPanda/Shopee still process synchronously in-request)
- [ ] **P2** DB7 partitioning (runbook-only), D6 HR-dashboard boot waterfall → single RPC, CI perf budgets, 5-scenario load-test plan
- [ ] **P3** tail: `/api/stats` cached counter, og-image 317KB→<80KB
- [ ] **P2** ⚠️ The 46-finding `PERF_SCALE_PLAN_2026-07-09.md` is an **untracked file** — commit it or the audit deliverable dies with this working tree

**Never measured:** no Lighthouse/CWV/bundle-size numbers exist anywhere in the repo; k6 load scripts exist but were never run.

### S5 — Clean architecture — 85/100
**Done:**
- [x] Zero raw supabase calls outside repositories (97 hits, all in `data/repositories`) — lint at error
- [x] 8-module pure domain layer + typed client (`createClient<Database>` live at `supabase.ts:17`)
- [x] 5 route gates composed into `<Guarded>` with a 276-line characterization test written BEFORE the refactor
- [x] Session store decoupled from infra side-effects (useSession 454→305 + `sessionBootstrap.ts`)
- [x] Restaurant god-DAL split: `store.ts` 1388→32-line barrel over 20 sub-domain modules — cf9eac2
- [x] No component in the app now exceeds 800 lines (largest: Cashier 767)
- [x] Matcher tunnel imports killed via shared-domain barrel + 56-test scoring oracle — 84ec158
- [x] Guard-rails survived eslint flat-config migration verbatim — 1995e49

**Open:**
- [ ] **P2** `matchForRole` still ~1,170-line god-function in match-core.ts
- [ ] **P2** `useHmDashboardData.tsx` still 780 lines (dedup ruled not behavior-safe without backend e2e)
- [ ] **P3** Two design-system homes coexist (`components/ui.tsx` legacy vs new `src/ui/*` kit); no retirement plan
- [ ] **P3** Bounded-context folder layout (`contexts/{recruitment,restaurant}`) never materialized; hexagonal "infra ports" not started; stale `shared/domain/README.md`

### S6 — Infrastructure & scale — 85/100
**Done:**
- [x] **`feat/scale-to-millions` is FULLY MERGED** (memory said "6 phases not pushed" — stale; merge-base = branch tip c79fca9)
- [x] 7-layer caching strategy documented (`docs/SCALABILITY.md`) AND implemented (vercel.json s-maxage/SWR, MV, SW, dedup)
- [x] Match queue live end-to-end: 1-min drain cron + heartbeat (0151), dead-man (0154), all lanes queued (4bbbb8d), priority escalation (0180)
- [x] DB hot-path fixes: batched DOB decrypt (0166), GIN CTE (0172) — both marked applied to prod
- [x] Idempotency on money POSTs (0165 + `_shared/idempotency.ts` in buy/redeem/unlock)
- [x] Edge observability in 14+ functions; global DB-backed rate-limit on money/match endpoints
- [x] CI: money-path exactly-once suite BLOCKING; verify_jwt invariant; migration replay
- [x] Realtime channel-churn fixed (stable per-user channel names) — dcda913

**Open:**
- [ ] **P1** Prod application of `post_deploy/0001_concurrently_indexes.sql` (talent pre-filter indexes) UNVERIFIED — matcher latency bet depends on it
- [ ] **P2** `rls_deny.sql` suite still advisory in CI (`continue-on-error: true`, ci.yml:185)
- [ ] **P2** Vercel `/api` middleware rate limiter still in-memory per-isolate
- [ ] **P2** Partitioning runbook-only; queue drain single-caller (both staged for later scale — OK)
- [ ] **P3** SWR `useQuery` seam adopted by only 2 admin panels; realtime multiplexing not done; DB-types CI drift gate missing

### S7 — Frontend UI system — 85/100
**Done:**
- [x] Design tokens + UI barrel (573a87a); 5 primitives on tailwind-variants + Storybook + addon-a11y (b7e5b2b)
- [x] Every serious axe violation cleared on public pages; axe suite is a hard CI gate (1acff04)
- [x] 10 Radix-skinned primitives (d68b24a); loading/empty/disabled/aria-busy first-class in primitives
- [x] Dark-mode token sweep, 766 conversions across 86 files (2a238ba, d41b287)
- [x] `<Button>` adopted across 26 files + `docs/UI_SYSTEM.md` guide (bc5903b)
- [x] God-components decomposed with hooksMoved=0 and per-commit gate evidence (603142e, 44be0cc)
- [x] Keyboard-test claim was audited, **refuted, and honestly fixed** — 12 real key-press tests (2eaedd5)
- [x] Outage hotfix verified ABOVE the UI phases on main, in working order (PR #31)
- [x] 13 e2e failures triaged with baseline counts (17 pass/15 fail unmodified main), zero new failures introduced

**Open:**
- [ ] **P2** RadioGroup has ZERO production adoption; 33 Phase-6 adoption candidates skipped with no tracking doc
- [ ] **P2** `docs/accessibility.md` stale since 2026-04-27 (contradicts shipped dark mode)
- [ ] **P2** Owner smoke-test of signup + role-post after decomposition never recorded
- [ ] **P3** Storybook build + per-story axe not in CI; ~34-46 neutral `dark:` one-offs remain; circular vendor→vendor-react chunk warning unresolved

**Never examined:** screen-reader (VoiceOver/NVDA) runs, axe on **authenticated** pages, visual regression tooling, zoom/reduced-motion/touch-targets, RTL/text-expansion.

### S8 — Tech-lead review — 76/100
**Done:**
- [x] Governance pair committed: `AGENTS.md` + `DIAMOND_ENGINEERING_PLAYBOOK.md` (246ebbb)
- [x] `docs/STATUS.md` single source of truth created; 6 launch gates with owner/severity (54f0269)
- [x] BaZi legal gate → lawyer-ready packet with 3 launch-gating questions (`docs/legal/LAWYER_PACKET.md`, 9cc2a27)
- [x] `/api/health` decision fully executed end-to-end
- [x] ADR-like locked decisions with rationale (ROAD_TO_A_PLUS §5); admin-MFA ADR at `docs/security/admin-mfa-policy.md`
- [x] Migration-drift detector script + do-not-auto-fix rationale; CI secrecy scan of locale JSON (37ff57b)
- [x] Failure-mode analysis (`docs/security/FAILURE_MODES.md`)

**Open (governance decay is the theme):**
- [ ] **P0** Lawyer packet UNANSWERED — DOB/race/religion matching signal + PDPA waiver + ToS licence (blocks launch)
- [ ] **P1** STATUS.md ("if any doc disagrees, this one wins") stale since 07-05 — exactly 90 commits behind
- [ ] **P1** Recorded rule "no refactors while users = 0" was contradicted by the subsequent UI/clean-arch work streams — no superseding decision recorded
- [ ] **P1** Monetization decision unmade: /pricing sells free+enterprise while code ships a full Diamond Points economy
- [ ] **P2** No postmortem for the 07-10 outage; mandated `docs/AUDIT_LOG.md` running log barely used
- [ ] **P3** OWNER_ACTIONS.md stale (still headlines the resolved dead pipeline); one commit (28984c9) admits `--no-verify` bypass

### S9 — Security — 87/100 (strongest execution)
**Done:**
- [x] C1 CRITICAL: `org_consultations` world-read/write locked to owner-or-admin — 0173 + 7 rls_deny refs
- [x] H1: client-controlled `is_extra_match` paid-tier bypass → 403 unless service role — 28984c9
- [x] H2: cross-company resume PII via self-settable company_id — fixed + defense-in-depth trigger 0184
- [x] H3: restaurant.orders anon cross-tenant read revoked; status via SECURITY DEFINER fn — 0183
- [x] H4: `report_html` stored-XSS → DOMPurify — 79473c4
- [x] NEW P0 (found 07-11): self-minted Diamond Points via table-level UPDATE — closed 0186/0187 + PR #33
- [x] Money: delivery-webhook constant-time HMAC + shopee sha512→sha256 bug; payment-webhook awaits paid delivery — 28984c9, 43bbc09
- [x] M2-M7, M9(partial), L1, L5: LLM-cost abuse, prompt-injection delimiters, feedback farming stage-gate, referral farming, meeting IDOR, signOut sweep, x-real-ip
- [x] Permissive-RLS CI gate (the audit's #1 systemic rec) shipped 2c2b1c8 on 07-11
- [x] Supply-chain scanning EXISTS (blocking prod npm audit + gitleaks + dependabot) — contrary to prior assumption

**Open:**
- [ ] **P1** H5 — proprietary life-chart algorithm still ships in the public JS bundle (runtime imports in 4 files); needs edge-fn/RPC + opaque code
- [ ] **P2** M8 — `life_chart_*` vocabulary leaks into bundle; CI secrecy grep misses the underscore form
- [ ] **P2** M1 residual — restaurant anon INSERT can still target any tenant's branch (QR-token path needed)
- [ ] **P2** rls_deny suite advisory; drift job advisory
- [ ] **P3** The 26-finding severity-ranked report itself is NOT in the repo (scratchpad only) — commit it
- [ ] **P3** L2 Billplz replay/nonce/amount assertion; ToyyibPay dead callback removal

**Never executed:** live pentest (payload catalogs exist, never fired), threat-model doc for the money paths.

### S10 — DevOps — 74/100 (weakest)
**Done:**
- [x] 8-job CI: typecheck/lint/vitest/build, e2e, full ephemeral-Postgres migration replay, db-apply with BLOCKING column-isolation gate, edge tests, security, drift
- [x] BLOCKING gates: money exactly-once suite (0b54169), verify_jwt pins, prod-dep npm audit + gitleaks (e575165)
- [x] `/api/health` deep endpoint (dead + degraded); heartbeat + dead-man; pipeline verified revived in prod
- [x] Sentry: edge sink (de94d89) + client source-map upload in build chain (0b54169)
- [x] One-shot backend deploy script; sin1 region pinning; CSP/HSTS; lefthook pre-commit
- [x] `docs/DEPLOYMENT.md` is a genuine Persona-10 audit artifact

**Open (the deploy plane is the hole):**
- [ ] **P0** Vercel prod promotion NOT gated on CI green — exactly how the 07-10 white-screen reached prod (owner: set Required Checks in Vercel dashboard)
- [ ] **P1** Backend deploy split-brain: frontend auto-deploys on push; migrations + 48 edge fns manual — no pipeline
- [ ] **P1** Prod `schema_migrations` ledger unreconciled (~40-57 migrations unrecorded); drift job advisory and skips without token
- [ ] **P2** No built-bundle boot smoke / vendor-chunk regression guard pre-promotion
- [ ] **P2** ROLLBACK_RUNBOOK.md stale + self-contradictory on the deploy model; restore/rollback drill never rehearsed
- [ ] **P2** "CI endemically red" claim UNVERIFIED (gh unauthenticated here) — check Actions history
- [ ] **P3** qa/run.mjs 21-check harness not wired into CI; 12-dsr check gives a false FAIL (http.mjs sends apikey+Authorization together)

**Never examined:** staging/preview environment strategy, branch protections, on-call/alerting design, restore-drill, cost/quota monitoring.

---

## 3. Corrections — session notes that are now WRONG (update your mental model)

- [x] ~~"feat/scale-to-millions 6 phases NOT pushed"~~ → **FULLY MERGED** (merge-base = tip c79fca9; phases P5-P9 shipped in July commits)
- [x] ~~"remediation branch pushed-not-merged + 0170-72 migration collision"~~ → **RESOLVED**: all 6 commits landed via PR #25 (b1fe0ca) with migrations renumbered 0173-0175
- [x] ~~"13 e2e failures are pre-existing/environmental"~~ → **REFUTED**: they were the real vendor-chunk outage bug, later fixed by PR #31. Lesson: local e2e reds deserve investigation before dismissal
- [x] ~~"OWNER_ACTIONS P0: pipeline dead"~~ → resolved 2026-07-04 (doc is stale, not the pipeline)
- [x] ~~"createClient&lt;Database&gt; is NOT a quick win (reverted)"~~ → landed at fff1550 on 07-09; STATUS.md stale
- [x] ~~"no dependency/supply-chain scanning"~~ → blocking prod npm audit + gitleaks + dependabot all in CI
- [x] ~~"permissive-RLS CI guard never implemented"~~ → shipped 2c2b1c8 on 2026-07-11
- Note: security finding IDs "H5/M8 deferred" have **no in-repo trace** — the numbered report exists only in session scratchpad. Commit it (see §6).

---

## 4. Master open list — deduplicated, all sessions

### 🔴 P0 — launch/deploy blocking
- [ ] **Lawyer sign-off** (one email): DOB/race/religion matching-signal PDPA exposure + consent copy + ToS licence — `docs/legal/LAWYER_PACKET.md` ready since 07-04, unanswered
- [ ] **Gate Vercel prod promotion on CI green** (Required Checks) — the 07-10 outage recurrence path is still open
- [ ] **Zero real users** — STATUS.md's own rule: the blocker is launch/acquisition, not more code

### 🟠 P1 — do next
- [ ] External uptime monitor on `https://diamondandjeweler.com/api/health` (UptimeRobot 5-min) — everything built for it, nothing pages
- [ ] Set `SENTRY_DSN_EDGE` secret (edge telemetry inert); set Billplz webhook signature secret
- [ ] Reconcile prod `schema_migrations` + verify CONCURRENTLY indexes in prod `pg_indexes` (run `supabase/post_deploy/0001`), then flip drift + rls_deny CI jobs to blocking
- [ ] H5: move life-chart algorithm out of the public bundle (edge fn/RPC, opaque code)
- [ ] Monetization decision: pick ONE model for the pilot (pricing page vs Diamond Points economy)
- [ ] Backend deploy pipeline (or at least a checklist-enforced script run) for migrations + edge fns
- [ ] ToyyibPay consult callback is dead code (401 before it runs) — build the webhook or remove the path
- [ ] Vendor-chunk regression guard: built-bundle boot smoke test in CI
- [ ] Backend-seeded e2e lane (unblocks S2 red-track + behavior-safe dashboard dedup)

### 🟡 P2 — quality/perf debt
- [ ] Perf big levers: B1 SSG/ISR, B3 lazy Supabase client, S2/S3 webhook inbox, D6 HR-boot RPC
- [ ] Off-platform escalation for `cron_deadman_check` (Resend/Slack)
- [ ] M8 vocabulary leak + extend CI secrecy regex to `life_chart_*`; M1 restaurant anon-INSERT QR-token path
- [ ] `match-core.ts` god-function decomposition (1,322 lines)
- [ ] Write the 07-10 outage postmortem; refresh STATUS.md / OWNER_ACTIONS.md / ROLLBACK_RUNBOOK.md / accessibility.md
- [ ] Fix qa `12-dsr` false FAIL; wire qa/run.mjs into CI (or schedule)
- [ ] Commit the untracked audit artifacts: `PERF_SCALE_PLAN_2026-07-09.md` + the 26-finding security report
- [ ] Manual launch checks never recorded: real device pass, RM1 live payment + refund, screen-reader walkthrough, backup restore

### ⚪ P3 — housekeeping
- [ ] F-06 email-verification inbox certification (Mailtrap/Mailosaur)
- [ ] Delete stale branch `fix/remediation-phase1-orgconsult-rls` (fully landed); triage 8 dependabot PRs; decide vite@8/vitest@4 major bump
- [ ] og-image 317KB→<80KB; `/api/stats` cached counter; dependency-cruiser gate; analytics vendor choice (Plausible vs GA4)
- [ ] Retire `components/ui.tsx` in favor of `src/ui/*`; adopt RadioGroup + the 33 skipped Phase-6 candidates

---

## 5. Not audited by ANY of the 10 sessions (the real blind spots)

| Area | Status | Risk |
|---|---|---|
| **Mobile / responsive QA** | ❌ NOT COVERED — Playwright is Desktop-Chrome-only; no device evidence anywhere | Mobile-majority Malaysian job seekers meet an IC-upload + ~10-min interview flow never run on a phone |
| **Live pentest execution** | ❌ NOT COVERED — 50 payloads + 44 jailbreak prompts catalogued, never fired | Code review kept finding live P0s as late as 07-11; an adversarial runtime pass would find more |
| **UAT / staging environment** | ❌ NOT COVERED — uat scripts exist, no environment provisioned | Load tests, pentests, restore drills, destructive migration rehearsal all permanently blocked |
| **Cross-browser (Safari!)** | ❌ NOT COVERED — chromium only | iOS Safari (SW caching, date inputs, file uploads) never exercised |
| Backup & DR | 🟡 PARTIAL — snapshot age automated; **restore never rehearsed**; PITR tier unconfirmed | Whole-project blast radius |
| Load/stress testing | 🟡 PARTIAL — k6 scripts committed, **never executed** | First real traffic IS the load test; prior 521 outage on smallest tier |
| Incident response | 🟡 PARTIAL — detection + rollback docs exist; no postmortems, no on-call/escalation | 2 outages in 2 months, no written learning loop |
| Financial reconciliation | 🟡 PARTIAL — idempotency strong; `reconcile_ledger_oneshot.sql` is one-shot, nothing recurring | Dropped gateway webhook = money collected, purchase stuck pending, invisible |
| Test-coverage depth | 🟡 PARTIAL — breadth yes, no coverage numbers | July P0s shipped through green CI |
| Cost audit | 🟡 PARTIAL — scattered fixes, never consolidated | Unknown ceilings: connections, egress, LLM spend |
| A11y on authed pages | 🟡 PARTIAL — public pages hard-gated only | Onboarding/dashboards/payment unscanned |
| Covered adequately | ✅ Secrets rotation runbook · SEO/analytics basics · i18n parity (1,725 keys ×3, verified) · email DNS (DMARC p=quarantine live) | — |

---

## 6. Owner-only actions (nobody else can do these — 30-minute list)

1. [ ] Send the lawyer email (`docs/legal/LAWYER_PACKET.md` — 3 questions)
2. [ ] Vercel dashboard → enable **Required Checks** so red CI blocks prod promotion
3. [ ] Point UptimeRobot (5-min) at `https://diamondandjeweler.com/api/health`
4. [ ] `supabase secrets set SENTRY_DSN_EDGE=<store URL>` (project sfnrpbsdscikpmbhrzub)
5. [ ] Set the Billplz webhook signature secret in the Billplz dashboard
6. [ ] Decide monetization model for pilot
7. [ ] Run `supabase/post_deploy/0001_concurrently_indexes.sql` via psql on prod, verify `pg_indexes`, reconcile `schema_migrations`, then flip the two advisory CI jobs to blocking
8. [ ] `git add` + commit the two orphaned audit artifacts (perf plan, security report)

---

*Generated 2026-07-11 by a 22-agent verification workflow (10 finders + 10 adversarial skeptics + open-items sweep + completeness critic), 100% evidence-grounded against `origin/main` @ `1121a08`. All 10 skeptic passes confirmed their finder reports with only minor corrections.*
