# `shared/domain` — the pure domain layer

Deterministic, framework-free business logic. **Dependencies point inward only:**
this layer imports **nothing** from React, react-router, Supabase, or any
infrastructure / data-access module. It can be unit-tested with no DOM and no
live database.

This is the innermost ring of the target clean architecture:

```
presentation ─► application ─► domain ◄─ (arrows point in)
       │              │
       └────► infrastructure ◄──── plugged in at edges only
```

The purity rule is enforced mechanically by the `no-restricted-imports` override
scoped to `src/shared/domain/**` in `.eslintrc.cjs` (set to `error`), so the
layer cannot accumulate framework or I/O dependencies.

## Current modules

| Path | Responsibility |
|------|----------------|
| `lifeChart/types.ts` | Life-chart type aliases only (`Gender`, `LifeChartCharacter`). The DOB → character derivation lives server-side (SQL `compute_life_chart_character`, migrations 0198/0210) so the algorithm never ships in the client bundle (H5). |
| `lifeChart/yearLuck.ts` | Year-luck stage → career-nudge category (pure; internal stage numbers never surfaced). |
| `identity/displayName.ts` | Given-name parsing + display-name formatting (pure). |
| `onboarding/chatStream.ts` | SSE frame decoding + `[PROFILE_READY]` sentinel handling for the Bo onboarding chat (pure; shared by the Talent + HM wizards via `useOnboardingChat`). |
| `match/lifecycle.ts` | Active/terminal match-status set definitions (single source of truth; each set's membership and order preserved verbatim). |
| `matcher/index.ts` | Barrel re-export of the recruitment scorer/reasoning from the Deno edge `_shared` package (pure re-export, byte-identical; the single web-side chokepoint). |
| `salary/validateSalaryRange.ts` | Pure salary-range validator (parameterized so each call site keeps its exact rules and messages). |
| `orgChart/orgChart.ts` | Org-chart consultant shared types, tiers, archetypes and compute. |
| `orgChart/orgChartSanitiser.ts` | Neutralises internal terminology in client-facing org-chart text before it is persisted/surfaced. |

Each module keeps its co-located `*.test.ts` golden-vector suite, which doubles
as the characterization net guaranteeing behavior was preserved across the move
from `src/lib/`.

> Relocated in the Phase 1 clean-architecture pass. Behavior unchanged — these
> files moved verbatim from `src/lib/`; only their folder (and importers' paths)
> changed. See `docs/ARCHITECTURE.md` for the full target layering and the
> incremental migration plan.
