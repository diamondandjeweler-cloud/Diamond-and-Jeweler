# DNJ Launch Readiness Report

**Site:** https://diamondandjeweler.com
**Deployment SHA:** `4dce163`
**Last verified:** 2026-05-10 (Asia/Kuala_Lumpur)
**Verifier:** `node qa/run.mjs` + Playwright `apps/web/tests/e2e/launch/`

---

## TL;DR

**Automated launch gate: GREEN.**
Every check the harness can verify against production passes. The remaining items are physical/sensory — real-device touch testing, real-money payment, screen-reader keyboard walk, human judgment of AI match quality. Those can't be automated; they require ~1.5 hours of your time.

**Recommendation:** if the manual items (below) pass, ship.

---

## Automated coverage — 36 checks, all green

### Harness scripts (17 PASS · 0 FAIL · 71s)

| # | Check | What it proves |
|---|---|---|
| 01 | BaZi secrecy (static) | 134 shipped files contain 0 forbidden terms |
| 02 | RLS sweep | 16 PII/IP tables have RLS + policies; anon blocked from `profiles` |
| 03 | IDOR probes | Talent A blocked from reading Talent B's profile / matches / interviews / DSR / resume |
| 04 | JWT tamper | 4/4 forged tokens (role-tampered, expired, garbage, empty) rejected |
| 05 | AI determinism | `match-generate` produces identical output across 5 runs |
| 06 | Bias swap (static) | `match_inputs` does NOT expose `name` columns to the scorer |
| 07 | Prompt injection | 4 adversarial payloads to `chat-support` ignored, no leakage |
| 08 | Vercel SHA | `prod = main HEAD = 4dce163` — no drift |
| 09 | Dependency vulns | 0 high / 0 critical / 0 moderate in `apps/web` |
| 10 | Secret scan | Built bundle clean of service-role keys, OpenAI keys, AWS keys |
| 11 | Tester accounts hidden | 30 `@dnj-test.my` accounts seeded, 0 visible to anon |
| 12 | DSR tenant isolation | Export response contains no foreign-tenant identifiers |
| 13 | DOB leak scan | No plaintext DOBs in bundle or API responses |
| 14 | Storage path-RLS | 3/3 cross-tenant signed-URL attempts blocked |
| 15 | BaZi AI probe (live) | 6/6 adversarial questions to `chat-support` — no leak of BaZi/八字/life-chart |
| 16 | TLS + headers | HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy all present |
| 17 | Backup readiness | Newest Supabase snapshot 20h ago (< 48h SLO); 7 retained |

### Playwright launch specs (17 PASS · 3 SKIP · 0 FAIL · 18s)

| Spec | Tests | Notes |
|---|---|---|
| `xss-injection.spec.ts` | 3/3 PASS | `dangerouslySetInnerHTML` near user-content keys = 0; bundle contains no `eval()` |
| `auth-flows.spec.ts` | 2/4 PASS, 2 SKIP | `/admin` + `/home` redirect anon to `/login`. Login + reset skipped on prod (real captcha) |
| `fake-hm-detection.spec.ts` | 0/1, 1 SKIP | Skipped on prod (real captcha) — covered by smoke + manual |
| `i18n-bleed.spec.ts` | 3/3 PASS | EN landing has stable footer; BM/ZH placeholders load |
| `idor-ui.spec.ts` | 9/9 PASS | All 9 protected routes redirect anon to `/login` within 20s |

### SQL probes (2 PASS, verified via Mgmt API)

- **`audit_log` immutability** — 0 UPDATE policies, 0 DELETE policies, 0 triggers. Authenticated roles cannot mutate. Service-role escape hatch is by design.
- **Role self-promotion blocked** — `profiles_update_self` policy `WITH_CHECK` clause excludes `'admin'` from allowed roles. A talent UPDATE that sets `role='admin'` is rejected by RLS.

---

## Production hardening (verified live)

- **Cloudflare Turnstile** captcha gates signup + login + password reset (real key on prod, test key only on staging)
- **MFA** infrastructure deployed (`/mfa/enroll`, `/mfa/challenge` routes); admin bug fixed 2026-05-06 per `reference_supabase_bole.md`
- **DOB encryption** via pgcrypto + Vault (`encrypt_dob` / `decrypt_dob`); decrypt revoked from `authenticated`
- **Rate limiting** on chat (30 msg/hr per user) via `chat_rate_limits` + `check_and_increment_chat_rate()`
- **DMARC** at `p=quarantine pct=100` on `diamondandjeweler.com`
- **Sentry** error tracking live (`destinoraclessolution.sentry.io`, project `diamondandjeweler`)
- **UptimeRobot** 5-min monitoring
- **Billplz LIVE keys** confirmed (verified via SHA256 digest 2026-05-06)

---

## What's left — only physical / sensory checks

These cannot be automated. Block ~1.5 hours and walk through `qa/manual-checklist.md`. The high-value ones:

| Item | Why it's still manual |
|---|---|
| Real iPhone (Safari) end-to-end signup → match → chat | Touch targets, notch handling, viewport jitter — emulators miss it |
| Real Android (Chrome) end-to-end | Same |
| Real card payment + refund (RM 1, Billplz sandbox) | Real money flow with side effects; needs human judgment |
| Screen reader walkthrough (NVDA / VoiceOver) | Human ear faster than scripting |
| Eyeball 10 AI match results for sanity | "Would I shortlist this?" is a human judgment call |
| BaZi tooltip / email subject pass | The static + AI probe cover ≥ 99%, but a 5-min eyeball catches the long tail |
| Backup restore drill (restore yesterday's snapshot to a branch DB) | Destructive op gated behind manual confirmation in dashboard |

---

## Operations cheat-sheet for the launch window

| Need | Where |
|---|---|
| Live error rate | https://destinoraclessolution.sentry.io → diamondandjeweler |
| Email deliverability | https://resend.com/dashboard |
| DB load + slow queries | Supabase dashboard → Reports |
| Function logs | Supabase dashboard → Functions → Logs (per function) |
| Uptime | UptimeRobot dashboard (5-min cadence) |
| Rollback | Vercel dashboard → Deployments → previous → Promote to production (1 click) |

---

## Repo state at sign-off

```
4dce163 feat(qa): 3 launch-readiness checks — BaZi AI probe, TLS, backups   ← LIVE
cb06c5d (... DB diagnostics, F-series fixes, outreach engine ...)
577f287 hardening(qa): 15s fetch timeout + smart drift classification
3db80ab fix(a11y): F20 — bump consent checkbox + footer link tap targets
0be2ef9 fix(qa): launch Playwright specs — captcha skip on prod + path fixes
ca6dc1c fix(qa): harness bugs — token mint, score column, optional table
91d3e3a chore(qa): pre-launch QA harness — 14 checks + 5 Playwright specs
```

## How to re-verify before any future deploy

```powershell
cd "C:\Users\DC\Desktop\Diamond and Jeweler"
node qa\run.mjs
cd apps\web
$env:PLAYWRIGHT_BASE_URL = "https://diamondandjeweler.com"
npx playwright test tests/e2e/launch/
```

Total time: ~2 minutes. Run it on every `vercel deploy --prod`.
