# Decision 0002 — Monetization model for the pilot

**Status:** OPEN — owner decision required
**Date raised:** 2026-07-12
**Owner:** [decide]

## Context

The product currently ships **two monetization models simultaneously**, which is incoherent for a pilot:

- **Pricing page** (`/pricing`) presents a **free tier + enterprise "contact us"** posture.
- **The code** ships a full **Diamond Points economy**: buy/redeem/unlock points, `award_points`,
  `redeem-points`, `admin-refund`, Billplz payments, and points-gated "extra match" unlocks across ~8
  surfaces.

A visitor is told "free"; the app behaves like a paid credits economy. Before a real user transacts,
one model must win for the pilot.

## Options

### Option A — Free pilot (recommended for a first cohort)
- Turn the points economy **off** behind a flag (`VITE_POINTS_ENABLED=false`); gate `/points` and the
  ~8 points surfaces; keep `/pricing` as free + "contact us".
- **Pros:** fastest to a clean, legally simple pilot; no live-payment risk during validation; removes
  the money-path surface (§6 danger zone) from the pilot blast radius.
- **Cons:** no revenue signal during the pilot; points code sits dormant (already built, low cost to keep).

### Option B — Paid points economy
- Make `/pricing` reflect the Diamond Points economy; ensure Billplz webhook secret is set (owner
  item 6) and the money paths are fully tested (Wave A adds the Billplz amount assertion).
- **Pros:** validates willingness-to-pay immediately; uses the built economy.
- **Cons:** live payments on day one; requires the money-path hardening + Billplz secret first;
  higher legal/consumer-protection surface for a first cohort.

## Recommendation

**Option A for the first pilot cohort**, then flip to B once the cohort validates demand and the
money paths have run through a real RM1 payment + refund test (owner smoke item 11). This de-risks the
launch and keeps the legal surface (Item 1 in the lawyer packet) as the single gating question.

## Consequence once decided

Engineering will, in one change: set the flag, gate the losing path's routes/surfaces, and align the
`/pricing` copy + locale strings so the presented model and the code agree. Either branch is ~half a
day and behavior-flag-guarded.
