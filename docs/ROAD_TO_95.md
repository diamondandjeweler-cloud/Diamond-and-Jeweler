# Road to 95% — every dimension to A / A+

_Plan to lift **every** dimension of the [re-audit](#scorecard) to **≥95% (A/A+)**, from the current state at commit `3b43291`. Successor to [ROAD_TO_A_PLUS.md](./ROAD_TO_A_PLUS.md); grounded in the 2026-06-30 re-audit (26-agent, adversarially verified: 17/18 top gaps confirmed real)._

---

## 0. The feasibility split — read this first

There are **two kinds of work**, with **two different owners**, and the target is only reachable if **both** happen:

| Track | Who | What it is | Verifiable by |
|---|---|---|---|
| **ENGINEERING** | me | code/tests/CI that lifts the 7 quality dimensions | `tsc` + `vitest` + `lint` + `build` (I run these) |
| **OPERATIONAL** | owner | rotate Vault key · deploy backend · monitor · MFA decision | the live system going green |

**Hard truth:** *Operational-readiness (62%) cannot exceed ~C+ without the OPERATIONAL track* — the live match pipeline is dead and the backend is undeployed; no code substitutes for rotating a secret and deploying. And *Performance/Architecture's path to 95% needs the OPERATIONAL track first* — the matcher N+1 collapse is byte-preserving scoring work that must be verified against a **live** scoring oracle, which only exists once the pipeline is revived. So:

- I can drive **Clean-Arch, Frontend-UI, Testing, DevOps, Security** to ~95% on the ENGINEERING track now (Wave 1).
- **Performance & Architecture** reach 95% in Wave 2 — authored now, **shipped only after Wave 0** so scores are verified, not assumed.
- **Operational-readiness** reaches 95% **only** when Wave 0 is done.

---

## <a name="scorecard"></a>Scorecard — now → target

| Dimension | Now | Target | The gap to 95%, in one line | Track |
|---|:--:|:--:|---|:--:|
| Architecture | A− / 90 | **A+ / 95** | matcher N+1 fully collapsed + drift gate blocking + (restaurant schema) | ENG W2 + OWNER |
| Performance | B / 81 | **A+ / 95** | 3 per-candidate DOB RPCs → write-time/set-based; `match-expire` off the serial HTTP loop | ENG W2 (needs OWNER first) |
| Clean-Arch | B+ / 85 | **A+ / 95** | decompose `matchForRole`/`scoreTalent`; finish the repository layer; remaining large files | ENG W1 |
| Frontend-UI | A− / 89 | **A+ / 95** | a11y gate blocking@0 + dark-mode coverage + `<Modal>` primitive + i18n HM routes | ENG W1 |
| Security | B+ / 86 | **A+ / 95** | ToyyibPay callback routing + admin TOTP + double-credit test | ENG W1 + OWNER |
| DevOps | B+ / 84 | **A+ / 95** | CI edge-deploy/`deno check` + drift gate blocking + source maps + telemetry wired | ENG W1 + OWNER |
| Testing | A− / 89 | **A+ / 95** | double-credit **integration** test + RLS-deny blocking + backed e2e flow | ENG W1 |
| **Operational** | C+ / 62 | **A / 95** | **rotate key + deploy backend + monitor** | **OWNER (Wave 0)** |

---

## Wave 0 — OWNER (the unlock; ~30 min total, no code from me)

Everything else is capped until these happen. They are small and mostly one-time.

| # | Action | Lifts | Effort |
|---|---|---|---|
| 0.1 🔴 | Rotate the Vault `service_role_key` (Dashboard → API → copy `service_role` → `select vault.update_secret(...)`) | Operational 62→~80 (revives the pipeline) | 2 min |
| 0.2 🟢 | Deploy backend: `supabase functions deploy` (money/match/webhook fns) + apply `0163/0164/0165` + run `supabase/post_deploy/0001` outside a txn | makes ALL session gains LIVE → Operational, Security, DevOps, Perf | 20 min |
| 0.3 🟡 | Point a free uptime monitor (UptimeRobot/cron-job.org) at `https://diamondandjeweler.com/api/health` | DevOps, Operational (paging) | 5 min |
| 0.4 🟡 | Decide admin MFA → require real TOTP (vs OAuth-only) | Security 86→A− | decision |
| 0.5 🟡 | Reconcile `schema_migrations` (I provide the INSERT SQL) so drift gate can flip blocking | DevOps, Architecture | 10 min |

---

## Wave 1 — ENGINEERING, safe + verifiable NOW (I drive; no live pipeline needed)

### Clean-Arch B+ 85 → A+ 95
- **Decompose `matchForRole` (1082 LOC) + `scoreTalent` (554 LOC)** into composed, individually-named stage functions in `_shared/match-core.ts`, building on the 9 pure scorers already in `_shared/match-scoring.ts`. Byte-preserving; pin every extracted pure stage with `vitest` golden vectors.
- **Finish the repository data-layer** — route the remaining raw `supabase.from/.rpc` calls through `src/data/repositories/*`; re-enable the `no-restricted-syntax` seam-guard (warn) once coverage is high.
- **Decompose the remaining large files**: `TalentOnboarding` 997, `PostRole` 854, `HMOnboarding` 792 (deeper), with characterization tests.

### Frontend-UI A− 89 → A+ 95
- **a11y**: fix the login/signup/reset/404 label + autofocus violations → flip `a11y.spec.ts` `≤99` to `toHaveLength(0)` + add one **authenticated-dashboard** axe scan with a seeded user.
- **Dark mode**: full pass over every authenticated dashboard/onboarding/form surface (`dark:` classes) + a theme snapshot test so it can't regress.
- **`<Modal>` primitive** (focus-trap/restore/Escape/`aria-modal`/scroll-lock); migrate the ~12 ad-hoc dialogs; replace user-facing `confirm()/alert()` on money/points with `<Alert>`/toast/`<Modal>`.
- **i18n**: finish HM sub-routes (Settings/Account/Company/PostRole/EditRole) + a lint guard flagging untranslated JSX in non-admin routes.

### Testing A− 89 → A+ 95
- **Double-credit INTEGRATION test** — `supabase/tests/payment_idempotency.sql`: seed a pending purchase, POST the webhook twice, assert the quota/points credit exactly once + the `0165` dedup row; wire into the `db-tests` CI job.
- **Wire `payment-webhook.test.ts` (deno)** into CI with a `deno test` job.
- **Flip `rls_deny.sql` `continue-on-error:false`** (blocking) — after the owner confirms the first CI run is green (it seeds + rolls back its own fixtures).
- **Backed two-sided e2e** (HM→match→talent→hire) against the `supabase start` CI DB — *XL, stretch*.

### DevOps B+ 84 → A+ 95
- **CI edge-deploy + `deno check` job** (push-to-main, `SUPABASE_ACCESS_TOKEN`) so edge fns ship with their callers — kills the split-brain.
- **Migration-drift gate → blocking** (after 0.5 reconcile).
- **Source-map upload** in `build` before `strip-sourcemaps` so client stacks de-minify.
- **Wire `observe.ts` into all money/match/webhook fns** (today 5/49); owner sets `SENTRY_DSN_EDGE` (0.2).
- **Off-platform dead-man escalation** (Resend/Slack from `cron_deadman_check`).

### Security B+ 86 → A+ 95
- **ToyyibPay callback routing** — dedicated `toyyibpay-webhook` fn (or a provider branch before the Billplz `x_signature` gate) so the verify branch actually runs.
- **Drop wildcard ACAO** on webhooks ✅ (shipped).
- **Admin TOTP** — owner decision (0.4).
- Double-credit test (shared with Testing).

### Architecture A− 90 → A+ 95
- Matcher N+1 collapse (Wave 2).
- CI drift gate blocking + edge-deploy (shared DevOps).
- Restaurant OS → `restaurant.*` schema *(L; or keep documented as a chosen constraint)*.

---

## Wave 2 — ENGINEERING needing Wave 0 first (authored now, shipped after the pipeline is live)

### Performance B 81 → A+ 95
- **Collapse the matcher N+1**: precompute `age_bucket` + `peak_age_score` at talent **write-time** (so `decrypt_dob`/`compute_age_match_score`/`get_peak_age_score` leave the per-candidate loop), **or** a single set-based `get_age_peak_scores(hm_dob, talent_ids[])` RPC mirroring the shipped `get_match_profile_previews(uuid[])` batch. Drops ~1,500 round-trips/generation to ~0.
- **`match-expire`**: replace the serial per-role HTTP regenerate loop with a `match_queue` enqueue.
- **Batch** `compare_nn_concerns` + the per-colleague team-fit loop.
- **Gate:** byte-preserving against the scoring test oracle + a sample-generation byte-compare — **requires the revived pipeline (0.1) to verify**, which is why this is Wave 2.

---

## Sequencing

```
Wave 0 (OWNER) ───────────────┐  (run in parallel with Wave 1)
                              ├──► Wave 2 (ENG: matcher, needs live oracle) ──► re-audit
Wave 1 (ENG, parallel batches)┘
```

Wave 1 ships in green, verified batches (the cadence used all session: branch → parallel agents → `tsc`+`vitest`+`lint`+`build` → push). Each batch states which dimension(s) it lifts and to what %.

## Guardrails (unchanged from AGENTS.md)
- Money/auth/scoring = byte-preserving, gated behind the test oracle + adversarial verify before ship.
- Two-phase deploy for any column/grant/contract change.
- Each batch ships green (typecheck + vitest + lint + build) before the next.
- No credential entry — Wave 0 stays owner actions.

## The honest bottom line
**I can take the seven code dimensions to ~95% on the engineering track.** *All eight* at ≥95% — including Operational-readiness — happens the moment **Wave 0** lands on top of that. There is no version of "all-95" that skips the owner's key rotation + deploy.
