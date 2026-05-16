# Email Verification — Manual Test Checklist

Automated tests cannot drive a live email inbox, so this flow requires a manual run before each release that touches auth, email templates, or the `/auth/callback` route.

## Prerequisites

- A disposable email address (e.g. a personal Gmail alias or [Mailnull](https://mailnull.com/))
- App running locally (`npm run dev`) **or** pointed at the staging/preview URL
- Supabase project in test mode (no custom SMTP needed for local — Supabase local dev captures all outgoing email in Inbucket)

## Local testing with Inbucket (recommended)

1. Run `npx supabase start` from the repo root.
2. Open `http://localhost:54324` — this is Inbucket, Supabase's local email catcher.
3. Register a new talent account at `http://localhost:5173/signup`.
4. Check Inbucket for the verification email and click the confirmation link.
5. Confirm the app redirects to `/home` with a live session.

## Manual test steps (staging / production)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Go to `/signup` and register with a fresh email address | Form submits; toast says "Check your inbox" |
| 2 | Open the verification email | Subject: "Confirm your email" from noreply@diamondandjeweler.com |
| 3 | Click the confirmation link | Browser opens `/auth/callback?...` |
| 4 | Observe the redirect | App redirects to `/onboarding/talent` (new user) or `/home` (existing profile) |
| 5 | Confirm session is live | `/home` loads without a login prompt |
| 6 | Try the link a second time | Supabase returns "Email link is invalid or has expired" — app shows a graceful error |
| 7 | Request a password-reset email | Arrives within 60 s; link works once; second click shows expired-link error |

## Edge cases to check manually

- Expired link (wait >1 h on production): app shows an "expired" message with a "Resend" action
- Wrong-account link (forward to a different browser): Supabase rejects it; app does not log the wrong user in
- Signup with an already-verified email: app shows "already registered — sign in instead"

## Failure triage

If verification emails are not arriving:
1. Check Supabase Dashboard → Auth → Logs for send errors
2. Verify the custom SMTP config (Settings → Auth → SMTP) if using a custom sender
3. Check spam folders — `noreply@diamondandjeweler.com` should be whitelisted in the SPF/DKIM DNS records
