# Postmortem — 2026-07-10 prod white-screen (vendor chunk / Radix transitive deps)

| | |
|---|---|
| **Date** | 2026-07-10 |
| **Severity** | SEV-1 — total outage. Every route (landing + login included) rendered a blank page. |
| **Duration** | From the deploy of `44be0cc` until the Vercel Instant Rollback, then fixed forward by `b91bea7` (PR #31). |
| **Detection** | **Manual — human noticed the blank page.** No automated alarm fired (see "Detection gap"). |
| **User impact** | Pre-launch (0 real users), so no customer harm. Would have been a full public outage post-launch. |
| **Author** | Wave-A docs batch (reconstructed from the git history and `docs/ROLLBACK_RUNBOOK.md`). |

Related: [ROLLBACK_RUNBOOK.md §1 (Vercel rollback)](../ROLLBACK_RUNBOOK.md) · [STATUS.md](../STATUS.md) · fix commit `b91bea7` · outage deploy `44be0cc`.

---

## Summary

A frontend deploy (`44be0cc`) shipped a JavaScript bundle that white-screened the entire app in
production. Every route rendered blank with `TypeError: Cannot read properties of undefined (reading
'useLayoutEffect')` thrown from the `vendor` chunk at module-eval time. The cause was a **code-splitting
mis-assignment**: Radix's *transitive* React-coupled dependencies were bundled into a chunk that
evaluated before React was defined. It was caught by hand, rolled back via Vercel Instant Rollback, and
fixed forward by extending the `manualChunks` matcher (PR #31, `b91bea7`).

## Timeline (all times MYT, UTC+8)

| Time | Event |
|---|---|
| — | `44be0cc` merges to `main` and **auto-deploys to prod** via Vercel git integration (every push to `main` = a prod deploy; see ARCHITECTURE §8). |
| — | Landing + login render blank. Console shows `Cannot read properties of undefined (reading 'useLayoutEffect')` in the vendor chunk at module-eval. |
| — | Outage noticed **manually** (no monitor fired). |
| — | **Mitigated:** Vercel Dashboard → Deployments → **Instant Rollback** to the last known-good deployment (`2eaedd5`). Takes effect immediately, no rebuild. |
| 2026-07-10 23:42 MYT | **Fixed forward:** `b91bea7` — extend `vite.config.ts` `manualChunks` to route the transitive Radix deps into `vendor-react`. Merged as PR #31. Repro'd on the unfixed build, verified clean after. |

## Root cause

`apps/web/vite.config.ts` `manualChunks` splits vendor code into two chunks: `vendor-react` (anything
that touches React at module-eval time) and a catch-all `vendor`. The rule that keeps React-coupled code
with React was:

```ts
norm.includes('/@radix-ui/')  // → 'vendor-react'
```

The eager shell components (`Layout`, `ErrorBoundary`) import the new `ui` barrel, which re-exports
`DropdownMenu` / `Tooltip` → `@radix-ui/*`. Radix in turn pulls in a set of **separate npm packages** that
call React hooks (`forwardRef`, `useLayoutEffect`) at module-eval time:

`react-remove-scroll`, `react-remove-scroll-bar`, `react-style-singleton`, `use-sidecar`,
`use-callback-ref`, `aria-hidden`, `@floating-ui`.

Because their package paths do **not** contain `/@radix-ui/`, the matcher missed them and they fell into
the plain `vendor` chunk. `vendor` evaluated before `vendor-react` (before React was defined), so the
first hook read hit `undefined.useLayoutEffect` → the whole app white-screened. The `manualChunks`
comment had already warned about exactly this class of failure for `@radix-ui/*` itself — the transitive
deps were the unguarded flank.

**Contributing factors:**
- The `ui` barrel is imported by *eager* shell components, so the bad chunk is on the critical boot path — the failure is total, not lazy-route-scoped.
- `44be0cc` deployed to prod automatically with no gate that renders the built bundle before promotion.

## Detection gap

There was **no automated detection**. The outage was found by a human loading the site. `/api/health`
checks the *pipeline* (DB + edge), not whether the SPA boots, so it would have stayed green through this
outage. Nothing watches the front door.

## What went right

- **Vercel Instant Rollback** made mitigation ~1 minute with no rebuild — the runbook's Option A worked exactly as documented.
- Pre-launch timing meant zero user impact.
- The fix was a precise, minimal `manualChunks` extension, repro'd locally before and after.

## Action items

| # | Action | Owner | Status |
|---|---|---|---|
| 1 | **Chunk-integrity build guard** — fail the build if any React-coupled package (the transitive Radix set + any future one) lands in a chunk other than `vendor-react`. Turns this exact class of bug into a red build instead of a prod white-screen. | Engineering — **Wave-A CI-Guards batch** | ▶ In progress (this wave) |
| 2 | **Uptime monitor on `/api/health`** (5-min, alert on 503) so the *next* outage pages someone instead of waiting for a human. | Owner | 🟠 Open — see `OWNER_ACTIONS.md` |
| 3 | **Enable Vercel Required Checks** (`web`, `db-apply`, `security`, `e2e`) so a red CI blocks a prod promotion. Item 1's guard is toothless until this makes it block. | Owner | 🟠 Open — see `OWNER_ONEPAGER_PATH_TO_100.md` |
| 4 | Tidy the `Circular chunk: vendor → vendor-react` rollup warning introduced by the fix (non-fatal; boot verified clean). | Engineering | Backlog |
| 5 | Consider a smoke check that renders the built bundle headlessly in CI (catches boot-time eval errors the type/lint gates miss). | Engineering | Backlog |

## Lessons

- A bundler chunk-assignment rule keyed on a package-name substring silently fails to cover *transitive* deps with different names — guard the invariant (React-coupled ⇒ `vendor-react`), not the enumerated list.
- Auto-deploy-on-merge with no render gate means any boot-time error is a live outage. The fix is a Required-checks gate + a chunk-integrity guard + a front-door monitor — none of which existed on 07-10.
