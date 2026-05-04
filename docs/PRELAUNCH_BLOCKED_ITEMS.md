# Pre-launch blocked items

Items from the 2026-05-04 pre-launch audit that need a human (legal review, vendor choice, or out-of-scope engineering work). Anything that could be auto-fixed has already shipped — see commit log around the audit date.

## Critical-4 — Hiring-side consent contains likely-unenforceable PDPA waiver

**Status:** untouched in code, awaiting legal review.

**Location:** `apps/web/src/routes/legal/Consent.tsx`, `hiringBody()` lines ~162–178 (en), 144–161 (zh), 125–142 (ms).

**Problem:** the "Waiver of Claims" paragraph asks hiring users to waive PDPA rights. Statutory rights cannot be waived under Contracts Act §24, and the clause contradicts our own Privacy Notice §10.

**Why we did not auto-fix:** rewriting consent copy without lawyer sign-off creates a worse risk than leaving it. ToS §8 already provides a properly drafted RM 5,000 liability cap with PDPA carve-outs — once legal confirms, the simplest fix is to delete the entire "Waiver of Claims" section and rely on ToS §8 alone.

**Action:** send `Consent.tsx` `hiringBody()` to lawyer with a one-line ask: "delete the waiver paragraph or replace with PDPA-compliant alternative."

---

## Sentry + analytics not installed

**Status:** not installed; vendor choice pending.

**Recommendation:** Sentry for error tracking, Plausible for analytics (PDPA-friendly, no consent friction), or GA4 if you need GA's reach (then gate behind `CookieBanner` accept).

**To install:**
1. Decide vendor.
2. Sentry: `npm i @sentry/react @sentry/vite-plugin`. Init in `main.tsx` before `ReactDOM.createRoot`. Add `VITE_SENTRY_DSN` to Vercel env.
3. Plausible: add `<script defer data-domain="diamondandjeweler.com" src="https://plausible.io/js/script.js">` to `index.html`. Zero JS bundle cost.
4. GA4: gate the GA snippet behind a `useEffect` in `App.tsx` that reads consent from `useSession`/`profile.consent_version`.
5. Wire Sentry into the consent retry in `Consent.tsx` so the final-failure branch reports.

**Why not auto-installed:** vendor choice has product/legal implications — Plausible avoids consent gating entirely, GA needs it.

---

## ToS missing IP / user-content licence clause

**Status:** untouched in code.

**Location:** `apps/web/src/routes/legal/Terms.tsx`.

**Problem:** the Terms do not grant DNJ a licence to host, display, and process user-uploaded content (résumés, interview answers, profile fields). Standard SaaS clause; lawyer should draft.

**Suggested clause (for lawyer review, not for direct paste):**
> "By submitting Content (including résumés, profile data, and interview responses) you grant DNJ a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, and display that Content solely for the purpose of operating the matching service and only for the duration described in our Privacy Notice."

---

## Backend authz audit for /hr and /hm

**Status:** route-level UI gating shipped (commit 3fb7c12), backend RLS audit pending.

**Scope:** every API route, RPC, and Edge Function reachable from `/hr/*` or `/hm/*` should check role server-side, not rely on RLS alone. Defense in depth.

**Suggested checklist:**
- All Edge Functions in `supabase/functions/` that can be called by hiring users — confirm role check in the first 10 lines.
- All RLS policies on `roles`, `matches`, `interviews`, `talents`, `companies` — confirm they reference `role` from `profiles`, not just `user_id` ownership.
- All RPC functions called from `HMDashboard`, `PostRole`, `MyRoles`, `EditRole`, `InviteHM`, `HRDashboard` — confirm `security definer` functions check role.

**Why not auto-done:** this is multi-hour and needs the engineer who owns the auth layer to walk it. Risk of false sense of security if rushed.

---

## Items already shipped (reference)

These were marked Critical/Major in the audit but had landed in code before the audit was published:

- **Critical-1:** DsrPanel `data_requests`→`profiles` embed FK ambiguity — fixed in commit 3fb7c12 (`profiles!data_requests_user_id_fkey`).
- **Critical-3:** `/hr` and `/hm` route gating — `RoleGate` wraps both in `App.tsx` (3fb7c12).
- **Critical-2 (route-access vector):** `/restaurant` is now both `RoleGate`-wrapped *and* feature-flagged behind `VITE_ENABLE_RESTAURANT`. Set to `false` (or omit) in production env.
- **Major:** security headers (CSP, HSTS, X-Frame, Permissions-Policy) — already in `vercel.json`.

The audit was likely run against a deployed build that pre-dated 3fb7c12. Re-run after the next prod deploy.

## Items shipped in the post-audit pass (this session)

- Admin error sanitization (DsrPanel, SystemConfigPanel) — raw PostgREST messages no longer rendered to the UI.
- Secret-key masking in SystemConfigPanel — keys matching `/(token|secret|api[_-]?key|password|webhook|private[_-]?key|signing[_-]?key)/i` are read-only with a "managed externally" notice.
- TalentProfile empty state now has an `<h1>`.
- `/.well-known/security.txt` — RFC 9116 compliant.
- `/restaurant` feature flag — `VITE_ENABLE_RESTAURANT` controls all restaurant routes including the public `/menu/:branchId` and `/restaurant/track/:orderId`.
- New `/admin` Audit log tab — paginated, filter by action group or actor/subject UUID.
- Consent save retry-with-backoff (3 attempts, 0/1s/2s, 15s timeout each).
- Per-page `document.title` via `useDocumentTitle` hook on Landing, all role dashboards, profile, post-role, edit-role, invite-hm, my-roles, data-requests, privacy, terms, consent, login, signup, 404.

## Production env flag to set on Vercel

```
VITE_ENABLE_RESTAURANT=false
```
(or simply omit — the flag defaults to disabled.)
