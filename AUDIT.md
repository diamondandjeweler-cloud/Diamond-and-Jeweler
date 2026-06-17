# Diamond & Jeweler (BoLe) — Senior Engineering Audit

**Question asked:** *"Is this build the most **minimal but scalable** version possible — a real startup that could scale to millions of users?"*

**Date:** 2026-06-17 · **Auditor:** senior full-stack review (6-dimension, adversarially verified) · **Stage:** pre-launch / pilot
**Scope:** recruitment core + Phase-2 extras. **Restaurant OS module is excluded** from grading but **quantified** as scope-creep evidence.
**Method:** every finding below was produced by a specialist auditor, then independently re-verified by a second engineer who re-opened the cited files. Severities are post-verification. Citations are `file:line`.

---

## 1. TL;DR — the verdict

> **No, it is not the most minimal version — but the foundation *is* genuinely scalable.**
> You have built a product that is **over-built in scope and plumbing, and under-finished in tests and the polish you advertise.** The bones can scale to millions; you must first **trim what's carried ahead of need** and **test the money/trust paths** before a pilot.

| | Score | Why |
|---|:---:|---|
| **Minimal?** | **42 / 100** | A whole out-of-scope Restaurant OS (~21% of frontend, ~21% of migrations, ~55 tables) is interwoven into the recruitment product, plus a stack of *dormant scaffolding* — 3 dead data-fetch abstractions, fully-translated locales that never load, a warmup cron firing ~3,960 calls/day at ~0 users, and a documented-but-never-scheduled job queue. |
| **Scalable?** | **68 / 100** | Design is genuinely scale-ready: one shared scorer, RLS on 62 tables / 229 policies / **0** `DISABLE RLS`, fail-closed idempotent payments, constant-time auth, set-based RPCs, correct single region. But the *scalable batch path is dormant*, the hot match path fires 6–9 sequential RPCs **per candidate**, sweeps are N+1, and there are **zero tests** on the matcher, money, or RLS. All fixable without re-architecture — so the ceiling is high but not yet earned. |

### Scorecard by dimension

| Area | Grade | One-line |
|---|:---:|---|
| 1. System architecture & scalability | **B** | Scale-ready *by design*, not yet *by runtime* (RPC fan-out, dormant queue). |
| 2. File structure & organization | **B−** | Clean dependency direction; undermined by 5 god-files and dead scaffolding. |
| 3. Database schema & migrations | **C+** | Good RLS + DOB encryption; **migration hygiene is the #1 foundation risk**. |
| 4. API / Edge Functions | **B** | Security-conscious and mostly minimal; a few real **money-correctness** gaps. |
| 5. UI architecture | **B−** | Solid stack; 3 competing data idioms, inert i18n, 1,300–1,600-line screens. |
| 6. Production readiness | **C** | Strong security *posture*; near-zero **test coverage** on exactly the paths that lose money or leak data. |

---

## 2. Why it's not minimal — scope-creep, quantified

This is the headline answer to your question. Hard numbers, verified to the line.

### 2a. Restaurant OS (the dominant creep)

| Surface | Restaurant | Core / total | Restaurant share |
|---|---:|---:|---:|
| Frontend `src` LOC | 8,970 (routes 6,689 + lib 2,281) | 42,019 total | **~21% of frontend** |
| Migration SQL LOC | 3,738 | 18,056 total | **~21% of migrations** |
| DB tables | ~55 `restaurant.*` | ~59 core `public.*` | **roughly doubles the table count** |
| All hand-written code | ~13,362 LOC | ~72,100 LOC | **~18.5% of everything** |

**It's not isolated — it's coupled to core auth:**
- `0042_restaurant_staff_role.sql:2-4` **DROPs and re-CREATEs the core `public.profiles` role CHECK** to add `'restaurant_staff'`.
- Restaurant tables FK straight into core `auth.users` (`0019_restaurant_schema.sql:189,482`; `0047_restaurant_multitenancy.sql:29,31`).
- `App.tsx` carries restaurant logic in **~5 places** (flag `:75`, 20 lazy imports `:77-96`, RoleGate `:219`, onboarding skip `:273`, redirect `:282`).
- It is the source of **4 of the 22 duplicate migration numbers** (`0025–0028`).

**Cost pre-launch is *not* runtime risk** (it's flag-off in prod via `VITE_ENABLE_RESTAURANT`). The cost is **audit/CI/blast-radius**: every RLS review, type-gen, security sweep, and migration replay drags POS/KDS/MyInvois along — and because it mutates the core role model, a restaurant change *can* touch recruitment auth. **A recruitment-only environment cannot even be provisioned without restaurant infrastructure.** Carrying it pre-launch buys nothing.

### 2b. Dormant scaffolding shipped ahead of need

| Item | Evidence | Status |
|---|---|---|
| `process-match-queue` (the documented "scalable batch path") | No `cron.schedule` anywhere; **zero** HTTP callers; its own docstring `:4` and `0108:17-19` **falsely claim a cron drains it** | Built, never runs |
| `cold_start_queue` | No automated drainer in any edge function | Piles up |
| **3 data-fetch/cache abstractions** | `useSupabaseQuery.ts` (0 consumers), `useDashboardData.ts` (0 consumers, 116 LOC), SWR provider-wired at `main.tsx:55` but consumed by nothing | Dashboards use a 4th, bespoke `dashboardCache` inline |
| `ms.json` + `zh.json` | 319 keys each, fully translated; imported nowhere; `i18n.ts:5-7` registers `en` only; `LanguageSwitcher.tsx` = `return null` | Inert |
| `db.generated.ts` | `export type Database = any` decoy; imported by no file | Dead |
| `~463 LOC dead components` | `SupportChat.tsx` (328), `MatchGate.tsx` (132), `LanguageSwitcher.tsx` (3) | Git-tracked, unused |
| Warmup cron | `0108:41` pings **11 functions every 4 min = ~3,960 calls/day** at ~0 users on nano compute | Premature |

---

## 3. Top systemic themes (the patterns behind the findings)

1. **Migration hygiene is the foundation risk.** 168 files across 144 distinct numbers → **22 numbers collide** (`0105` and `0139` appear **3×**). README says "run in order, in the SQL editor" (manual). CI only does `ls | sort -c` — it **never applies them to a real database.** This is *not theoretical*: the migration headers themselves narrate **two launch-critical production outages** caused by apply-order/clobber — `0105` restoring an `ic_path` **PII re-exposure** that `0103`'s blanket `GRANT` had silently undone, and `0093` re-fixing an RLS recursion that took **storage down with 503s.**
2. **Untested money & trust paths.** ~928 LOC of tests (all pure utils) vs ~58k LOC of app+SQL. The **1,590-LOC matcher**, the payment webhook, points/redeem, referrals, and **all 229 RLS policies** have **zero** automated tests. Two real money bugs already exist (below) — exactly what a money-path test would catch.
3. **Built-but-dormant.** Effort was spent on scale/polish infrastructure that doesn't run (job queue, SWR, i18n locales, generated types).
4. **Secrecy is fragile-by-pervasiveness.** No leak in dashboards (sanitized "Signal"/"Team-fit" labels), **but** the active talent **consent text literally renders "life-chart / BaZi"** to users, and the self-service DSR export ships `life_chart_score` + `internal_reasoning`. The terminology lives as identifiers/columns in ~10–15 files, so any new admin/debug/export surface leaks it. No CI grep gate.
5. **Data-access is the opposite of the otherwise-scalable design.** Per-candidate RPC fan-out, N+1 sweeps, an inline LLM call in the match path.
6. **Observability/ops are fire-and-forget.** Crons `net.http_post` with no status check and depend on hand-populated Vault secrets (a fresh deploy that skips them makes **every cron — including PDPA data-retention — a silent no-op**). Docs are stale (`deploy.md` lists 5 of 48 functions and 5 of 168 migrations; PRELAUNCH says "Sentry not installed" — it is).

---

## 4. Launch blockers (must-fix before pilot)

| # | Blocker | Why it blocks | Effort |
|:--:|---|---|:--:|
| 1 | **Neutralize the talent consent that renders "life-chart / BaZi"** | `0021:47` seeds the only active consent row with literal `(life-chart / BaZi)`; `Consent.tsx:48/58` falls back to that raw body for talents (only the hiring side was rewritten), rendered via `dangerouslySetInnerHTML:161`. No migration neutralizes it. **Live secrecy breach + advertises DOB fortune-telling in hiring = discrimination/PDPA/PR liability** before the first signup. Fix reuses the existing neutral `hiringBody()` copy. | **S** |
| 2 | **Fix two money bugs: `redeem-points` balance check + `admin-refund` points claw-back** | `redeem-points` never reads the balance; `award_points` floors at 0 (`0056:51-54`) → **free extra matches**. `admin-refund` flips payment to refunded but never reverses credited points → refunded buyers keep spent value. The correct pattern already exists in-repo (`charge_urgent_priority`, `0077:61-70`). | **S** |
| 3 | **Stop the DSR/secrecy leak in the self-service export** | `dsr-export` uses `select('*')` on `matches` → serializes `life_chart_score` + `internal_reasoning.character_bucket` into the user-facing PDPA bundle (secrecy), **and** the role-side export leaks *other candidates'* scoring rationale to an HM (privacy). Project explicit user-safe columns. | **S** |
| 4 | **Make migrations deterministically replayable + apply them in CI** | 22 duplicate numbers make fresh-DB order tool-dependent; headers prove this already caused 2 prod incidents. Add a `supabase db reset`/apply job + a duplicate-prefix gate; renumber **un-applied** duplicates only. | **L** |
| 5 | **Add high-value tests: matcher + payment webhook + RLS deny-suite** | The systems that silently lose money or leak across tenants are validated only by reading code. ~10 scoring tests, webhook invalid-sig/replay/double-pay tests, ~15 RLS deny cases against `supabase start`. | **L** |
| 6 | **Resolve the two legal gates** (engineering can't close) | `PRELAUNCH_BLOCKED_ITEMS.md`: an unenforceable PDPA rights-waiver in hiring consent (Contracts Act §24, contradicts your own Privacy Notice §10) and a `Terms.tsx` with **no licence to host/process uploaded resumes** — the platform's core function. Needs Malaysian legal sign-off. | **S** (human) |
| 7 | **Schedule `process-match-queue` (or delete it) + guarantee cron Vault secrets** | The documented scalable path runs from nothing; cold-start queue likewise. All crons read auth from hand-populated Vault secrets and never check `net.http_post` status — a fresh deploy that skips two `vault.create_secret` statements silently disables every cron. Add the schedule (or remove the dead queue) + a Vault-existence + dead-man check. | **M** |

---

## 5. Quick wins (high impact, low effort)

- Supersede the active consent row with the neutral copy `hiringBody()` already uses — removes the live BaZi leak in **one migration**.
- Copy `charge_urgent_priority` (`0077`) `SELECT…FOR UPDATE` + raise into a `redeem-points` RPC — kills the free-extra-match leak.
- Add the points claw-back (`award_points` negative delta keyed on refund id) to `admin-refund`.
- Project explicit columns in `dsr-export` instead of `select('*')` — closes secrecy **and** candidate-privacy leak at once.
- **Delete dead code now (pure subtraction, zero risk):** `SupportChat.tsx` + `MatchGate.tsx` + `LanguageSwitcher` (~463 LOC), `useSupabaseQuery.ts` + `useDashboardData.ts` (0-consumer), `db.generated.ts` (decoy).
- Add a CI **duplicate-migration-prefix gate** (extend the existing `ls|sort-c` job).
- Add a CI **secrecy grep gate** failing on `bazi|八字|life[\s-]?chart` in any literal flowing to JSX/user text or DSR export (extend `orgChart.test.ts`).
- Drop/shrink the warmup cron (11 fns × every 4 min) — wasteful at ~0 users on nano.
- **Enable RLS on `industry_synonyms`** — the only core table with RLS off, and `0119:21-23` grants full DML to `authenticated`, so it's currently **write-tamperable by any logged-in user** (it feeds matching).
- Update `deploy.md` to a scripted `db push` + functions-deploy loop incl. the two `vault.create_secret` statements; mark Sentry **DONE** in PRELAUNCH.
- Stop rendering raw `err.message` in the `ErrorBoundary` user fallback (`:85`); keep it in Sentry/DEV only.
- Rename internal secrecy identifiers (`life_chart_* → signal_*`, `monthly_fortune → monthly_outlook`) so any future downstream read is harmless.

---

## 6. Detailed findings by dimension

Severity legend: 🔴 High · 🟠 Medium · 🟡 Low. Effort: S/M/L/XL.

### 6.1 System Architecture & Scalability — **B**

**Take:** Architecturally scale-ready — one shared scorer, RLS-as-the-authz-boundary, idempotent payments, set-based RPCs, correct single region for a Malaysia-first pilot. The debt is concentrated in **data-access patterns** and the **dormant queue**, both isolated, low-blast-radius fixes.

| # | Finding | Sev | Eff | Evidence → Fix |
|:--:|---|:--:|:--:|---|
| A1 | Per-candidate scoring loop fires **6–9 sequential SQL RPCs per talent** (more with team members) — the dominant engine bottleneck | 🔴 | L | `_shared/match-core.ts` `scoreTalent()` issues `get_life_chart_bucket:509`, `get_year_luck_stage:687`, `decrypt_dob:786`, `compute_age_match_score:793`, `get_peak_age_score:805`, `compare_nn_concerns:949`, nested per-team-member `:761-768`. → Collapse into **one set-based RPC keyed on the candidate-id array**; keep TS scoring in-memory. Turns ~3–4k round-trips into ~2–3. |
| A2 | **`process-match-queue` is dormant** — the documented scalable batch path has no schedule and no caller; docstring `:4` + `0108:17-19` falsely claim a cron runs it | 🔴 | S | All UI triggers call `match-generate` synchronously (`PostRole.tsx:453`, `EditRole.tsx:161`, `MyRoles.tsx:131`). `cold_start_queue` also has no drainer. → Add a 1-min `pg_cron` job mirroring `bole-match-expire-every-6h`; route heavy path through `enqueue`. |
| A3 | `match-expire` is **N+1 per match/role** and **HTTP-fans-out to `match-generate` inside a serial `await` loop** | 🟠 | M | `match-expire/index.ts` Pass A `:45-53`, ghost queries `:170-192`, serial regen `:202-220`. → Batch into set-based SQL UPDATEs; replace HTTP fan-out with INSERTs into `match_queue` (pairs with A2). |
| A4 | Restaurant OS coupled to core auth/profiles — dominant scope-creep | 🟠 | XL | See §2a. Flag-off in prod limits *runtime* risk; cost is audit/CI/blast-radius. → Extract to its own project/repo; at minimum move `restaurant_staff` out of the core `profiles` CHECK. |
| A5 | 22 duplicate migration numbers → non-deterministic apply order | 🟠 | M | See §3.1 / §6.3-D1. |
| A6 | Inline Anthropic call in the match-insert path (bounded to the **3 selected** matches, 15s timeout + graceful fallback) | 🟡 | S | `match-core.ts:1264` inside `Promise.all` over `top` `:1200-1202`. Single region is correct/minimal for pilot. → Insert matches first, generate the pitch async so LLM latency never blocks matching. |
| A7 | `interview_rounds` realtime subscription has **no server-side filter** (table-wide) | 🟡 | S | `TalentDashboard.tsx:327` (vs filtered `matches` channel `:304`). **Not a leak** — RLS on `interview_rounds` (`0060:156-160`) gates the broadcast — but a fan-out scaling smell. → Scope per-match channels when volume grows. |

### 6.2 File Structure & Code Organization — **B−**

**Take:** Dependency direction is clean (`lib` has zero upward imports; the admin dashboard's 21 lazy panels + declarative tabs are exemplary). Undermined by a handful of god-files and the dormant scaffolding from §2b.

| # | Finding | Sev | Eff | Evidence → Fix |
|:--:|---|:--:|:--:|---|
| F1 | **God-components:** 5 screens > 1,100 LOC as single components | 🔴 | L | `HMDashboard.tsx` 1,619 · `TalentOnboarding.tsx` 1,553 · `TalentDashboard.tsx` 1,342 · `HMOnboarding.tsx` 1,135 · `PostRole.tsx` 978; ~32 `useState` in the largest, inline fetching (`HMDashboard.tsx:231`). → Lift data into a per-feature hook; split JSX into sections; per-step onboarding. |
| F2 | **No data-access layer:** ~124 raw `supabase.from()` + 25 `.rpc()` across 43 core files while configured SWR sits unused | 🔴 | L | Zero route/component imports `useSWR`; the only consumer (`useSupabaseQuery.ts`) has 0 consumers; SWR wired at `main.tsx:55`. → A thin `lib/queries/` of typed hooks on the already-installed SWR; migrate heaviest screens first. |
| F3 | ~463 LOC dead, git-tracked components | 🟠 | S | `SupportChat.tsx` (328, the live one is `SupportForm.tsx`), `MatchGate.tsx` (132), `LanguageSwitcher.tsx` (3, `return null`). → Delete. |
| F4 | Multilingual scaffolding dormant: `ms.json`/`zh.json` fully translated, never wired | 🟠 | S | `i18n.ts:3,5-7,14,16` = `en` only; `Profile.locale` typed `'en'|'ms'|'zh'`. → Activate **or** park; don't ship the half-state. |
| F5 | Duplicated UI helpers + domain interfaces across dashboards (already drifting) | 🟡 | S | `RoundBadge` in both dashboards renders **"Scheduled" vs "Upcoming"** for the same status; `InterviewRound`/`InterviewProposal` + `fmt()` copy-pasted 4×. → Hoist to `types/` + a shared `ui` module. |
| F6 | Restaurant-only `ManagerPin.tsx` + `restaurant_staff` Role string in shared/core surfaces | 🟡 | S | `ManagerPin.tsx` imported only by restaurant routes; `types/db.ts:1` Role union; App.tsx branches `:273,282`. → Move into `routes/restaurant/`; split the Role type on extraction. |
| F7 | `db.generated.ts` is a dead `Database = any` placeholder; real types hand-written in `db.ts` | 🟡 | S | `db.generated.ts:15`, imported nowhere. → Delete, or actually run `supabase gen types` and wire `createClient<Database>`. |

### 6.3 Database Schema & Migrations — **C+**

**Take:** The *design* is good — DOB decrypt revoked from `authenticated` (`0068:18`), `life_chart_compatibility` admin-only RLS, `get_match_candidates` is `LANGUAGE sql STABLE ROWS 200`. The *process* is the risk: a fix-on-fix migration history with duplicate numbers and no replay test.

| # | Finding | Sev | Eff | Evidence → Fix |
|:--:|---|:--:|:--:|---|
| D1 | **22 duplicate migration numbers** make the set non-deterministically orderable — already caused 2 prod outages | 🔴 | L | `0105`/`0139` ×3; headers: `0105_restore_ic_column_lockdown.sql:1-12` (LAUNCH-CRITICAL `ic_path` PII re-exposure undone by `0103`'s blanket GRANT), `0093_fix_roles_recursion.sql:1-14` (storage 503 RLS recursion). CI (`ci.yml:96-104`) only lints filenames. → Timestamp prefixes or squash to a verified baseline; renumber **un-applied** dups; add `supabase db reset` smoke test + duplicate-prefix gate. |
| D2 | BaZi/life-chart secrecy leak in the **active talent consent** | 🔴 | S | `0021:47` (only active consent row) → `Consent.tsx:48/58` talent fallback → `dangerouslySetInnerHTML:161`. → Supersede with neutral body; add `talentBody()`; extend the `orgChart.test.ts:137` secrecy invariant to consent. |
| D3 | Restaurant OS interleaved into the recruitment migration timeline (~55 tables, ~3.7k LOC) | 🟠 | L | 55 `create table restaurant.*` vs ~59 core; `0019:1` `create schema restaurant`. → Extract to its own migration stream (the `restaurant.*` schema makes the split clean); resolves the `0025–0028` collisions for free. |
| D4 | `compute_life_chart_score()` is a **stub with zero callers** but still `EXECUTE`-granted to `authenticated` | 🟠 | S | `0008:41` returns NULL → `0021:86` re-creates as a fake zodiac stub; grant `0008:82` never revoked. → Delete it (nothing live calls it); retires the stale grant. |
| D5 | Heavy reactive **RLS churn** = a fragile (not lean) authz layer | 🟠 | M | `0014` helpers → reverted → `0093` re-fix; `0091/0092` lock `ic_path` → `0103` undoes → `0105` restores; `0138` auth.uid wrap sweep. → pgTAP/CI invariant tests (cannot SELECT others' `ic_path`; no recursion; `decrypt_dob` not executable by `authenticated`) + a lint flagging inline cross-table `EXISTS` in policies. |
| D6 | Warmup cron: 11 fns every 4 min (~3,960 calls/day) on low tier | 🟡 | S | `0108:41,58-68` (key resolved from Vault at runtime — *not* plaintext). → Drop for pilot or reduce to 2–3 latency-sensitive fns. |
| D7 | `industry_synonyms` has **no RLS** while `0119` grants full DML to `authenticated` — write-tamperable | 🟡 | S | `0041:12` (only core table without RLS, verified across all 57); `0119:21-23`. → `ENABLE RLS` + read-`true`/admin-write, matching `tag_dictionary`. |

> **Doc-drift note (verify & fix):** the README advertises DOB encryption via **pgsodium** + key `bole_dob_key`, but the shipped implementation is **pgcrypto** (`0013_dob_encryption_pgcrypto.sql`). The encryption is functional and decrypt is admin/service-role gated — this is a **stale-doc** issue, not a vuln, but it belongs in the same cleanup as the stale `deploy.md`/PRELAUNCH below.

### 6.4 API Surface — Edge Functions — **B**

**Take:** Genuinely security-conscious — Billplz HMAC **fail-closed** + CAS idempotency, server-side price resolution, one `_shared/auth.ts` with constant-time service-role compare + `is_banned` gate, Svix-verified `resend-webhook`, `chat-support` BaZi-hardened. The gaps are a few **money-correctness** holes and unthrottled LLM endpoints.

| # | Finding | Sev | Eff | Evidence → Fix |
|:--:|---|:--:|:--:|---|
| P1 | Second payment provider (**ToyyibPay**, consults) has **no callback signature verification or handler** | 🔴 | M | `init-consult-booking:56,90-91,125` sets up ToyyibPay; `payment-webhook:47-57` hard-requires a **Billplz** signature; `tryConsultBooking:285-289` looks up by Billplz `id` a ToyyibPay callback never carries → real callbacks 401, bookings stick "pending". → Drop ToyyibPay and route consults through hardened Billplz, **or** verify via ToyyibPay `getBillTransactions` server-side. |
| P2 | `redeem-points` can spend points the user doesn't have (no balance check; floors at 0) | 🟠 | S | No balance read; `award_points` `0056:51-54` = `greatest(0, …)`. Correct guard exists at `charge_urgent_priority` `0077:61-70`. → Copy that `FOR UPDATE` + raise pattern; map to a 402. |
| P3 | **`admin-refund` refunds money but never claws back credited Diamond Points** | 🟠 | S | `admin-refund:90,96` issues refund + flips status; no compensating `award_points(-points)` for `purchase_type='points'` granted at `payment-webhook:247-253`. → Add idempotent negative `award_points` keyed on refund id; warn if already spent. |
| P4 | **7** LLM-invoking endpoints have **no rate limiting** (cost-abuse) | 🟠 | S | `extract-talent-profile`, `extract-hm-profile`, `extract-deal-breakers`, `extract-feedback-tags`, `extract-non-negotiables`, `draft-role-description`, `enqueue-talent-extraction` all authenticate then fetch an external LLM with no throttle (only `chat-support`/`chat-onboard` are throttled). → Wrap with the existing `check_and_increment_chat_rate` via a shared `withRateLimit()`. |
| P5 | DSR export leaks BaZi-derived fields + other candidates' rationale | 🟠 | S | `dsr-export:57` `select('*')` on `matches` → `life_chart_score` (`0001:168`) + `internal_reasoning.character_bucket`; role-side export leaks other talents' scoring. → Project explicit user-safe columns; durably rename columns to neutral terms. |
| P6 | `award_points` SELECT-then-INSERT → concurrent dup returns a 500 not a 409 | 🟡 | S | `0056:37-49` (unique index `0056:14-16` is the real guard, so **no** double-spend). → `EXCEPTION WHEN unique_violation THEN RETURN 0`. |
| P7 | `process-referral` accepts arbitrary `referred_user_id` on the permanent-code path | 🟡 | S | `process-referral:35,69-74` (no email check on the permanent path) → per-victim points farming with valid UUIDs. → Ignore body id for non-service callers; fire only on onboarding-complete; cap/day. |
| P8 | `monthly-fortune` persists "fortune" vocabulary + BaZi-derived summary into DB/notification | 🟡 | S | `monthly-fortune:49-68,81`. **Not** user-rendered today (`NotificationBell:33` omits `data`). → Rename table/column/reason to `monthly_outlook`. |

### 6.5 UI / Frontend Architecture — **B−**

**Take:** Solid modern stack and correct patterns where they count. Over-engineered in defensive plumbing (two dead data hooks, inert i18n) yet under-finished in advertised polish (a11y, multilingual). Subtractive cleanups are exactly right for a lean pilot.

| # | Finding | Sev | Eff | Evidence → Fix |
|:--:|---|:--:|:--:|---|
| U1 | Three competing data-fetching idioms; two documented abstractions are dead | 🟠 | M | `useSupabaseQuery.ts` + `useDashboardData.ts` both 0-consumer; 218 direct `supabase.*` across 70 files (198/62 ex-restaurant); SWR provider wired, unconsumed. → Pick **one**, delete the others. |
| U2 | i18n scaffolded but inert; `ms`/`zh` translated yet never load; `LanguageSwitcher` is a no-op | 🟠 | L | `i18n.ts:5-19` en-only; no `LanguageDetector`; launch sentinel `i18n-bleed.spec.ts:8` admits "mostly hardcodes English"; 319 identical keys per locale (= fully translated). → Activate or remove; don't ship the half-state. |
| U3 | WCAG AA claim is aspirational — axe suite is in soft-warning mode, skips all authed UI | 🟡 | M | `a11y.spec.ts:26-30` TODO; `:45` asserts `<= 99` violations (non-blocking); only 7 public routes. → Fix the known auth-form label/autofocus issues; flip back to `toHaveLength(0)`; add one authed scan. |
| U4 | Largest dashboards are 1,300–1,600-line monoliths mixing data, realtime, dense JSX | 🟡 | L | `HMDashboard.tsx` 1,619 (load+subscribe+teardown in one effect `:422-457`); 53 memo hooks across ~11 files. → Folds into U1's shared hook + section components. No virtualization needed yet. |
| U5 | `isHM` resolution relies on a raw `fetch()` workaround around supabase-js, patched in 2 places | 🟡 | M | `useSession.ts:64-95` (hand-built REST call; builder "returns 0 rows … empirically verified"); self-heal effect `App.tsx:117-121`. → Root-cause the token-attachment race; resolve `isHM` from one `profiles` fetch / SECURITY DEFINER RPC. |

### 6.6 Production Readiness — **C**

**Take:** The security **posture** is strong (strict CSP + HSTS preload, idempotent fail-closed payments, constant-time auth, full DSR triad). This is a **verification-gap** story, not a security-posture story: the green CI checks overstate real safety.

| # | Finding | Sev | Eff | Evidence → Fix |
|:--:|---|:--:|:--:|---|
| R1 | **Matcher, money paths, and all 229 RLS policies have zero tests** (~928 LOC tests, all pure utils) | 🔴 | L | No `match-core`/`matchForRole` reference in any test; no `supabase/tests`; payment-webhook untested. → ~10 deterministic scoring tests (fake db), webhook invalid-sig/replay/double-pay, ~15-case RLS deny-suite vs `supabase start`. **Single most leveraged pre-launch investment.** |
| R2 | CI doesn't apply migrations to a DB; no dependency/secret scan; no preview gate | 🟠 | M | `ci.yml:96-104` lints filenames only; e2e runs vs fake `ci-anon-key`, no backend; no Dependabot/CodeQL/gitleaks. → `supabase start` + apply-all job (highest value) + `npm audit`/secret-scan. |
| R3 | Deploy + pre-launch docs are stale; manual deploy of 48 fns / 168 migrations is a launch-day SPOF | 🟠 | S | `PRELAUNCH_BLOCKED_ITEMS.md` says "Sentry not installed" but `@sentry/react` is in `package.json:29` + init `main.tsx:26-38`; `deploy.md:34-38,72-76` lists 5 migrations + 5 functions. → Scripted `db push` + functions-deploy loop + the 2 `vault.create_secret` statements; fix the doc. |
| R4 | Crons are fire-and-forget; nano-compute + single-region SPOFs | 🟠 | M | `0005_cron.sql:25-62` no status check; Vault-secret dependency `:6-12`; prior nano HTTP-521 outage (memory). → Heartbeat row + Sentry breadcrumb per cron + a daily dead-man check on `data-retention`/`match-expire`; upgrade off nano before public. |
| R5 | Live service-role + Resend secrets in plaintext `.env.local`; no rotation runbook | 🟡 | S | `.env.local` is git-ignored/untracked (**not** a repo leak); no `docs/` rotation procedure. → Prefer managed secrets; add a 1-page rotation runbook; rotate once before public. |
| R6 | Legal launch blockers (see §4-#6) | 🟠 | S | `PRELAUNCH_BLOCKED_ITEMS.md` Critical-4 + ToS content-licence gap. → Malaysian legal sign-off. |
| R7 | `ErrorBoundary` renders raw `err.message` to users | 🟡 | S | `ErrorBoundary.tsx:85` (escaped text + strict CSP → not XSS, but info-leak/UX). → Keep the message in Sentry/DEV only. |
| R8 | CI e2e "launch" suite runs against a no-backend preview and asserts almost nothing | 🟡 | S | `ci.yml:81` exports base URL so specs don't skip, but `:67-68` builds with fake key, no backend; XSS spec only fetches `/`. → Point at `supabase start` with seeded testers, **or** rename to "static-bundle smoke" so green ≠ behavioural QA. |

---

## 7. Roadmap — minimal *and* scalable, in order

### Phase 0 — Make the pilot safe (lean; no new scale infra)
*Goal: close every launch blocker — secrecy, money correctness, replayable DB, tests on trust paths, legal, silent-cron risk.*
1. Supersede the talent consent to neutral copy (remove the user-visible BaZi leak) — **S**
2. Project user-safe columns in `dsr-export`; strip `life_chart_score`/`internal_reasoning`/other candidates' data — **S**
3. `redeem-points` balance check via a `FOR UPDATE` RPC (copy `0077`) + `admin-refund` points claw-back — **S** each
4. Renumber un-applied duplicate migrations + CI duplicate-prefix gate + `supabase db reset`/apply-in-CI smoke — **L**
5. High-value test layer: ~10 matcher tests, payment-webhook invalid-sig/replay/double-pay, ~15 RLS deny cases — **L**
6. Send `Consent.tsx hiringBody()` + `Terms.tsx` to a Malaysian lawyer (drop the PDPA waiver, add content licence); confirm SSM name + DSR commitments — **S (human)**
7. Schedule `process-match-queue` (or delete it) + cron Vault-secret assert + dead-man check on `data-retention`/`match-expire` — **M**
8. CI secrecy grep gate + `npm audit`/secret-scan; fix auth-form a11y enough to make the claim honest — **M**

### Phase 1 — Trim to the minimal core
*Goal: subtract everything carried ahead of need so the recruitment product is the smallest honest version that still scales.*
1. **Extract Restaurant OS** out of the recruitment project (own migration stream/project; move `restaurant_staff` out of the core `profiles` CHECK; isolate the App.tsx branches) — **XL** *(the single biggest minimality win)*
2. Delete dead code: `SupportChat`/`MatchGate`/`LanguageSwitcher` (~463 LOC), `useSupabaseQuery` + `useDashboardData`, `db.generated.ts` — **S**
3. Decide i18n honestly: wire `ms`/`zh` + detector + switcher, **or** park the locales and trim `Profile.locale` to `'en'` — **L/S**
4. Delete `compute_life_chart_score` (zero callers) + retire its grant — **S**
5. Pick **one** data layer (SWR is already wired) and delete the others; fold `dashboardCache` into it — **M**
6. Drop/minimize the warmup cron; enable RLS on `industry_synonyms` — **S** each
7. Move the inline Anthropic summary out of the synchronous match-insert path — **S**

### Phase 2 — Earn the right to scale
*Goal: convert the scale-ready design into actually-scalable runtime once real traffic justifies it.*
1. Collapse the per-candidate scoring loop into **one set-based RPC** keyed on the candidate-id array — **L**
2. Batch `match-expire` passes into set-based UPDATEs; replace serial HTTP fan-out with `match_queue` INSERTs drained by the now-scheduled worker — **M**
3. pgTAP/CI RLS invariant tests + a lint flagging new inline cross-table `EXISTS` in policies — **M**
4. Incrementally split the god dashboards (lift data+realtime into the chosen hook; section components) — **L**
5. Scope the `interview_rounds` realtime subscription server-side — **S**
6. Per-user rate limiting on the 7 unthrottled LLM endpoints — **S**
7. Promote the e2e suite to run against `supabase start` with seeded testers (or rename it); revisit compute tier / read-replicas only when traffic demands — **M**

---

## Appendix — facts & method

**Codebase metrics (verified):** `apps/web/src` ≈ 176 files / 42,019 LOC · 92 route files · 48 edge functions / ~12,018 LOC · 168 migrations / 18,056 LOC (144 distinct numbers; 22 collide, `0105`/`0139` ×3) · 62 RLS tables / 229 policies / **0** `DISABLE RLS` · ~928 LOC of tests.

**Stack:** React 18 + Vite 5 + TS 5.5 + Tailwind 3 + Zustand + SWR + react-router 6 + i18next + Sentry + PWA · Supabase (Postgres/Auth/Storage/Edge Functions/pg_cron/pg_net) · Vercel (SIN1) · Resend · Billplz (+ ToyyibPay, partial). Region: Singapore.

**Method:** 6 specialist auditors read the real source and returned evidence-cited findings; each dimension was then re-verified by a second engineer who independently re-opened the cited files (false positives rejected, severities adjusted, omissions added). The migration-collision count and the pgsodium→pgcrypto doc-drift were additionally confirmed first-hand.

**Limitations:** static read-only review — no runtime profiling, no live DB introspection, no load test executed (a k6 script exists at `tests/load/`). The Restaurant OS module was deliberately **not** graded. Legal findings require a qualified Malaysian lawyer; this audit only flags them.
