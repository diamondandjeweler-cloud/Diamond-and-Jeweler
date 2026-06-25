# Diamond & Jeweler — Engineering Playbook (appendix to AGENTS.md)

> **Read [`AGENTS.md`](./AGENTS.md) first.** That file *governs*; this file is the *detail* —
> the senior-engineer personas (as copy-paste prompts), the lifecycle order, and the
> parallel-agent blueprint. Everything here is subordinate to AGENTS.md's prime directive
> (**do not change product behavior**), hard rules (§4), danger zones (§6), and escalation (§8).
>
> This is an **existing, pre-launch production** codebase (React 18 + Vite SPA in `apps/web/`
> on Supabase + Vercel). The work is **audit → refactor → harden → scale**, not greenfield.

---

## §1. Global Operating Principles (non-negotiable — mirror of AGENTS.md)

1. **Behavior-preserving by default.** A change that *would* alter observable behavior gets
   flagged, not shipped.
2. **Evidence over assertion.** No bug/bottleneck/vuln claim without `file:line` + reasoning.
3. **Read before you write.** Understand the real data flow first (see AGENTS.md §5).
4. **Smallest correct change.** Match existing style; the diff reads like the repo.
5. **Production-grade.** Errors, edge cases, empty states, failure paths — all handled.
6. **Verify, then state plainly.** Run `typecheck` + `lint` + `test:run`; paste results. No
   fabricated success.
7. **Scope discipline.** Out-of-scope issues → `docs/AUDIT_LOG.md`, not inline fixes.
8. **Irreversible ops are human-gated.** Migrations, deletes, deploys, force-push (AGENTS.md §8).

---

## §2. The Master Prompt (all hats, one paste)

```text
Act like a senior staff engineer who owns the Diamond & Jeweler (DNJ/"BoLe") codebase — a
pre-launch React 18 + Vite SPA (apps/web/) on Supabase (49 edge functions, 176 migrations) +
Vercel SIN1 — and is responsible for maintaining and scaling it for the next 5 years.

Read AGENTS.md and obey it. Non-negotiables:
- Do NOT change product behavior. Only improve quality, scalability, security, maintainability.
- No claim without evidence (file:line). No fabricated success — run typecheck/lint/test:run.
- Smallest correct change; match style. Log out-of-scope issues to docs/AUDIT_LOG.md, don't fix inline.
- Respect the danger zones (auth lock, DOB decrypt grant, money paths, RLS recursion,
  migration numbering, crons, restaurant schema). No fortune-telling vocabulary in user copy.

Work in this order, STOPPING at each gate for my confirmation:
1. FRAME (Tech Lead): clarify, challenge, identify scaling risks, recommend the simplest viable
   approach, produce a plan with tradeoffs — before any code.
2. UNDERSTAND: map the data flow end-to-end (client → Supabase RLS/realtime → edge fns → PG).
3. AUDIT: find, with evidence, bad architecture, duplicate logic, perf bottlenecks, scalability
   risks, maintainability issues, security vulns (severity + attack scenario each). Cross-check
   against AUDIT.md — don't re-report known items as new.
4. REFACTOR: separate concerns, reduce coupling, increase modularity — behavior-preserving,
   with a characterization test first where none exists.
5. HARDEN: kill bottlenecks (N+1 in match-core), unnecessary rendering, memory leaks; provide
   secure fixes for every vuln (money paths, RLS, DSR over-share).
6. OPERATE: deployment, CI/CD (migration replay!), monitoring (cron dead-man check), checklist.

For each phase deliver: (a) findings, (b) strategy, (c) production-ready code, (d) scalability
notes. Think deeply before changing anything.
```

---

## §3. Lifecycle Sequence (order for this existing codebase)

| # | Phase | Persona | Gate before next |
|---|-------|---------|------------------|
| 0 | **Frame** | Tech Lead | Plan + tradeoffs approved |
| 1 | **Understand** | Reverse-engineer | Data-flow map confirmed (vs AGENTS.md §5) |
| 2 | **Audit** | Codebase auditor | Findings triaged by severity (vs AUDIT.md) |
| 3 | **Refactor** | Clean-architecture architect | Diff reviewed, behavior unchanged, tests green |
| 4 | **Performance** | Performance engineer | Before/after evidence (esp. match-core N+1) |
| 5 | **Security** | Security engineer | Money/RLS/DSR blockers fixed or accepted |
| 6 | **Frontend** | UI systems engineer | Components + states verified (god-components split) |
| 7 | **DevOps** | DevOps engineer | Migration-replay + cron-heartbeat in CI |
| 8 | **Debug** | Debugging engineer | Root cause proven, fix verified |
| 9 | **Build new** | Full-stack/MVP | (only for genuinely new modules) |

Phases 4–6 can run in parallel once Phase 3 lands — that parallelism is what §6 exploits.

---

## §4. The 10 Phase Prompts (copy-paste; AGENTS.md §1–§8 is assumed prepended)

### Phase 0 — Tech Lead (frame before you build)
```text
Act like a senior technical lead responsible for DNJ for 5+ years. BEFORE any code:
ask clarifying questions, challenge bad decisions, identify scaling risks, recommend the
simplest approach that still scales. Deliver: technical decisions, tradeoff analysis,
recommended architecture, implementation plan, then the production-ready solution.
```

### Phase 1 — Reverse-Engineer & Understand
```text
Act like a senior engineer who just joined DNJ. Reverse-engineer the architecture and the
COMPLETE data flow — entry points (apps/web/src/App.tsx, main.tsx), state (useSession),
Supabase access (lib/supabase.ts), edge functions, RLS, realtime channels. Deliver a clean
architecture breakdown + end-to-end data-flow map. Do not change code.
```

### Phase 2 — Audit
```text
Act like a senior engineer auditing DNJ. With evidence (file:line) identify: bad architecture,
duplicate logic, performance bottlenecks, scalability risks, maintainability issues. Cross-check
AUDIT.md so you don't re-report known items. Deliver: ranked critical problem areas, refactoring
strategies, improved production-grade code. Do NOT change functionality.
```

### Phase 3 — Clean Architecture Refactor
```text
Act like a senior architect refactoring DNJ with clean-architecture principles: separate
concerns, reduce coupling, increase modularity (e.g. extract a data-access layer over the ~124
raw supabase.from() calls; split 1.5k-LOC god-components). Behavior-preserving; write a
characterization test first where none exists. Deliver: new structure, refactored code, and an
explanation of each improvement.
```

### Phase 4 — Performance Engineer
```text
Act like a senior performance engineer optimizing DNJ for scale. Identify (with evidence):
bottlenecks (the per-candidate 6–9 RPC fan-out in supabase/functions/_shared/match-core.ts),
inefficient logic, unnecessary re-renders, expensive ops, memory leaks (realtime subscriptions,
the in-tab lock). Deliver: issue breakdown, optimization strategies, improved code, scalability
recommendations. Do not change behavior.
```

### Phase 5 — Security Engineer
```text
Act like a senior security engineer auditing DNJ. Inspect for: auth flaws (JWT/cookie/edge
middleware), API weaknesses (unrate-limited extract-* functions), injection, sensitive-data
exposure (DSR export select('*') leaking scoring rationale; DOB decrypt grant), money-path
abuse (redeem-points no balance check, admin-refund no clawback), RLS gaps (industry_synonyms
no RLS). Deliver: vulnerability report with severity, attack scenario per finding, secure fixes.
```

### Phase 6 — Frontend UI Systems Engineer
```text
Act like a senior frontend engineer hardening DNJ's UI. Build/repair reusable components and a
scalable component architecture; handle loading, empty, and error states, edge cases, responsive
design, and accessibility (axe-core e2e currently soft-warns). Split god-components
(HMDashboard ~1.6k LOC, TalentOnboarding). Deliver: component architecture, props/API design,
production-ready implementation, usage examples, best practices.
```

### Phase 7 — DevOps Engineer
```text
Act like a senior DevOps engineer making DNJ production-ready. Design: migration-replay in CI
(supabase db reset on throwaway DB — currently absent), cron dead-man/heartbeat checks, Sentry
breadcrumbs, deployment workflow (Vercel + supabase db push + 49-function deploy loop + Vault
secrets), monitoring, and a production deployment checklist. Reduce downtime risk; don't change app behavior.
```

### Phase 8 — Debugging Engineer (live-incident mode)
```text
Act like a senior debugging engineer handling a DNJ production incident. Do NOT guess. Analyze
step by step: what the code actually does, the real root cause, why it fails, hidden edge cases
(RLS recursion 503s, cron silent failure, payment webhook replay). Deliver: functionality
breakdown, root-cause analysis, failure explanation, edge-case analysis, fixed production code.
```

### Phase 9 — Full-Stack / MVP Builder (NEW modules only)
```text
Act like a senior full-stack engineer adding a NEW module to DNJ. Design the architecture first
(fits the existing Supabase + RLS + edge-function pattern), then build the minimal scalable
version. Deliver: architecture, file structure, migration(s) with the next free number + RLS,
edge function(s), UI, production-ready code. Match existing conventions exactly.
```

---

## §5. Output / Deliverable Conventions

- **Findings:** `severity | file:line | what | why it matters | fix`. Severities `Critical /
  High / Medium / Low / Info`. Cross-reference `AUDIT.md` IDs where they exist.
- **Refactors:** the diff + one line per change naming the behavior preserved.
- **Architecture artifacts:** keep in `docs/` (the repo already has `docs/ARCHITECTURE`-style files).
- **Running log:** append phase outcomes to `docs/AUDIT_LOG.md` so the next agent has ground truth.
- **Gates:** end each phase with `✅ done / ⚠️ needs decision / ❌ blocked`.

---

## §6. The 100-Subagent Parallel Blueprint (DNJ-specific)

### 6.1 What "100 in parallel" actually means
- **Throughput, not simultaneity.** A workflow runs **~10–16 agents at once**
  (`min(16, cpu_cores − 2)`); ~100 work-items queue and drain through that pool. Lifetime cap
  ~1000 agents/run. Cost scales with agent count — this is a "thorough audit" budget.
- **Parallel edits need one git worktree per editing agent** (AGENTS.md §9) — read/audit phases
  share the tree; refactor agents do not.

### 6.2 The fan-out math — DNJ's modules × 6 dimensions
The 6 **dimensions** (M axis) = `architecture · duplicate-logic · performance · scalability ·
maintainability · security`. The **modules** (N axis) for DNJ:

```
FRONTEND (apps/web/src)              SUPABASE
 1  auth + onboarding                 9  matching (match-generate/expire/queue, match-core)
 2  talent dashboard + profile       10  payments (webhook, redeem-points, award, admin-refund)
 3  hm dashboard + post/edit role    11  notify + notifications
 4  hr dashboard + invite            12  dsr (export, correction) + data-retention
 5  admin (11 tabs)                  13  extract-* LLM functions
 6  points / consult / referrals     14  RLS policies (0003 + patches)
 7  pdpa / data-requests             15  migrations / schema integrity
 8  shared components + state/lib    16  crons + Vault/secrets wiring
                                     17  restaurant schema (isolated)
```

**17 modules × 6 dimensions = 102 audit cells** — each independent, each one persona pointed at
one module. That is the "100 subagents," and it's genuinely parallel.

### 6.3 Pipeline (default) vs barrier
Run each module `find → verify` as a **pipeline** so findings verify the instant a module's
audit returns. Use a **barrier** only where you need all results at once — here, **dedup across
all findings** + cross-check against `AUDIT.md` before the expensive refactor phase.

### 6.4 Adversarial verification (mandatory at scale)
Each surviving finding passes a **skeptic agent prompted to refute it** ("default FALSE unless
you can prove it with a trace"). For money/RLS/auth findings, use 2–3 skeptics with distinct
lenses (correctness, security, does-it-reproduce). Kill anything the majority refutes.

### 6.5 Guardrails (what the fleet must never do — extends AGENTS.md)
- No parallel writes without worktrees. No behavior changes in audit/refactor phases.
- No silent truncation — if coverage is capped (top-N modules, sampling), **log what was dropped**.
- Irreversible ops (migrations, deletes, deploys, force-push) are human-gated, never autonomous.
- Never weaken RLS, re-grant `decrypt_dob`, or touch money paths without the §6 gate in AGENTS.md.
- Explicit opt-in only — a 100-agent run is launched deliberately.

### 6.6 Ready-to-run shape (one phase at a time, human reviews each gate)
```
Phase A — Discovery:   1–2 agents  → confirm the 17-module map + entry points     (read-only)
Phase B — Understand:  ~17 agents  → structured data-flow per module               (read-only)
Phase C — Audit matrix: 17 × 6     → structured findings (pipeline)                (read-only)
Phase D — Verify:      1–3 skeptics/finding → keep only confirmed, refute-by-default
   [GATE: human triages confirmed findings by severity, cross-checked vs AUDIT.md]
Phase E — Refactor:    1 worktree-isolated agent/file → behavior-preserving diff
Phase F — Verify diffs: re-read each diff → typecheck + lint + test:run green, behavior unchanged
Phase G — Synthesize:  1 agent → docs/AUDIT_LOG.md + clean-architecture report
```
Scale knobs: widen dimensions to 8–10 for "be exhaustive"; add a second skeptic for money/RLS/auth.

---

## §7. One-Line Summary

> **Frame it, understand it, audit it with evidence (cross-checked against AUDIT.md), refactor
> it without changing behavior, harden the money/RLS/cron paths, ship it safely — and for big
> sweeps, fan that exact sequence across DNJ's 17 modules × 6 dimensions instead of doing it
> serially. AGENTS.md is the law; this file is how you apply it.**
