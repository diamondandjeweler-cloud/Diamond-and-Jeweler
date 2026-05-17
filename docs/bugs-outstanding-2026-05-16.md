# DNJ — Outstanding Bug Report  ⚠️ SUPERSEDED

> **This report is STALE. Do not action it.**
> Verified against live production (`diamondandjeweler.com`, commit `3e486b88`)
> on 2026-05-11. All four code bugs below were already fixed by a later
> session; this doc was written against an earlier deploy and never updated.
>
> Kept as a stub for traceability. The original bug descriptions are in git
> history / prior session transcripts.

## Verification outcome

| ID | Original claim | Live status (2026-05-11) | Where it's fixed |
|----|----------------|--------------------------|------------------|
| F-03 | Auth redirect drops destination (no `?next=`) | ✅ Already fixed | `ProtectedRoute.tsx:12` adds `?next=`; `middleware.ts:146` adds `?from=`; `Login.tsx:27` reads both |
| F-08 | No server-side login rate limiting | ✅ Already fixed | `check_login_rate_limit` + `record_login_attempt` RPCs (called from `Login.tsx`); client lockout 3 fails/15 min; `middleware.ts` caps `/api/*` at 100/min |
| F-09 | "0 Diamond Points" shown to HM accounts | ✅ Already fixed | `Layout.tsx:58` gates the badge to `role === 'talent'` |
| F-10 | No autosave/draft on Post-Role form | ✅ Already fixed | `PostRole.tsx` — debounced 600 ms localStorage autosave + DB-backed `job_posting_drafts` + restore banner |
| F-06 | Email verification flow untested | 🔍 See verification-flow audit below / next QA pass | Not a code bug — an untested path |

## Still open (carried forward)

- **F-06** — email verification flow: end-to-end inbox delivery still needs a
  real or sandbox inbox (Mailtrap/Mailosaur) to fully certify. The
  confirmation-link mechanics (single-use, expiry handling) can be — and were —
  tested via the admin `generate_link` path without an inbox.

## Not a bug — a decision

- **Billplz** is on LIVE production keys. That is **correct for launch.**
  Sandbox keys are only needed to run test payments without real charges.
  Either keep live (and test with one small real charge + refund) or flip to
  sandbox temporarily (and remember to flip back before launch).
