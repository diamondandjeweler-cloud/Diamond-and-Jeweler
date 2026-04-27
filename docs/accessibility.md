# Accessibility

Target: **WCAG 2.1 AA**. Full third-party audit pending before public launch.

## What's in place

- **Skip-link** to main content in [Layout.tsx](../apps/web/src/components/Layout.tsx) — first tab stop on every authenticated page.
- **Landmark roles** — `role="banner"`, `role="main"`, `role="navigation"`, `role="contentinfo"` on the Layout shell.
- **Focus-visible outline** — keyboard users see a clear blue ring; mouse users don't get a dotted outline.
- **Loading state** — [LoadingSpinner](../apps/web/src/components/LoadingSpinner.tsx) announces itself via `role="status" aria-live="polite" aria-busy="true"` with screen-reader-only text.
- **Notification bell** — `aria-haspopup`, `aria-expanded`, descriptive `aria-label` ("Notifications: 3 unread"). Closes on **Escape** or outside click.
- **Form labels** — every input has an explicit `<label>` associated with it. Required consents have visible `*` markers.
- **Semantic buttons vs. links** — buttons trigger actions, links navigate. No `<div onClick>` traps.
- **Color contrast** — Tailwind `text-gray-600` on white meets 4.5:1; brand blue 600 on white meets 4.5:1.

## Automated coverage

- **ESLint** runs `eslint-plugin-jsx-a11y` on every `src/**/*.{ts,tsx}` file via `npm run lint` and in CI.
- **Playwright + axe-core** scans every public route (`/`, `/login`, `/signup`, `/password-reset`, `/privacy`, `/terms`, `/does-not-exist`) against WCAG 2.1 AA in [tests/e2e/a11y.spec.ts](../apps/web/tests/e2e/a11y.spec.ts). The e2e CI job fails on any `critical` or `serious` violation.

## Known gaps (to fix before launch)
- [ ] No screen-reader testing performed on onboarding flows.
- [ ] Radio-button groups in the onboarding (talent interview, leadership questions) are `<button>` elements instead of semantic `<input type="radio" role="radio">` with a `<fieldset>`. Works with keyboard but arrow-key navigation is missing.
- [ ] File-upload fields don't announce the selected filename to screen readers.
- [ ] Match cards don't announce updates when a realtime notification arrives.
- [ ] Dark-mode not offered (low contrast for some users; defer until Phase 2).

## Testing checklist (pre-launch)

Run these manually in Chrome:

1. **Tab through the landing page** — every interactive element is focusable, focus ring visible, focus order logical.
2. **axe DevTools** (browser extension) on `/`, `/signup`, `/onboarding/talent`, `/hm`, `/admin` — fix any violations flagged **critical** or **serious**.
3. **VoiceOver / NVDA on onboarding** — talent can complete IC upload → 20 Qs → 20 ratings → submit without visual cues.
4. **Zoom to 200%** on `/` and `/talent` — no horizontal scroll, nothing clipped.
5. **Keyboard-only navigation** — sign up, log in, accept a match, sign out. No traps.

## Further reading

- [WCAG 2.1 quick reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [Malaysian Communications and Multimedia Commission accessibility guidelines](https://www.mcmc.gov.my/) — subsumes WCAG for government sites; private platforms not yet mandated but best-practice.
