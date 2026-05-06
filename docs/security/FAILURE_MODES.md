# Failure-mode analysis — DNJ

For each failure scenario: what breaks, what already mitigates it, and what gap (if any) needs addressing.

---

## F1. Supabase project goes down (entire project unreachable)

**Blast radius:** site-wide. The frontend can't sign users in, fetch roles, send chat, or accept payments.

**Mitigations in place:**
- Vercel-hosted static frontend stays up (returns last shipped HTML).
- The error boundary in [main.tsx:7](apps/web/src/main.tsx) catches uncaught errors.
- CSP allows only `connect-src 'self' https://sfnrpbsdscikpmbhrzub.supabase.co` — failure shows blocked-fetch console errors, not a broken HTML.

**Gap:** there is no "Supabase down" banner. Users see blank dashboards or login spinners.

**Suggested fix:** add a top-level `usePing()` hook that tests `https://<supabase>/auth/v1/health` every 30 s; render a `<DegradedBanner>` if it fails for 60 s.

## F2. Billplz callback delayed by 10 minutes (or missed entirely)

**What user sees:** points are not credited until the callback arrives.

**Mitigations:**
- `point_purchases.payment_status='pending'` row is created **before** the redirect.
- `PaymentReturn.tsx` shows "We're processing your payment" while pending — never grants prematurely.
- Webhook is idempotent (row-level guard on `payment_status='pending'`).

**Gap:** if Billplz never calls the webhook, the row stays `pending` forever.

**Suggested fix:** a daily cron `reconcile-stuck-purchases` that calls Billplz `GET /api/v3/bills/<id>` for all rows older than 1 h with `payment_status='pending'` and either flips to `paid` or `failed` based on Billplz's source of truth.

## F3. Email server (Resend) fails

**What breaks:** confirmation emails, magic-link invites, payment receipts, interview notifications.

**Mitigations:**
- The `notify` edge function uses `.catch(() => {})` everywhere — webhook + match-generate succeed even if notify fails.
- Supabase Auth has its own email retry, configurable in dashboard.

**Gap:** users may not realise their action succeeded if no email arrives. No retry queue for app-level notifications.

**Suggested fix:**
- Add a `notification_outbox` table with `status='pending'|'sent'|'failed'`.
- `notify` writes a row first, then attempts send; on failure, mark `failed` with retry count.
- Cron `retry-failed-notifications` re-attempts up to 3 times with backoff.

## F4. User closes browser mid-payment

**Sequence:** redirected to Billplz → enters card → closes tab before Billplz redirect-back.

**Mitigations:**
- Billplz still calls the server-side webhook directly. The webhook flips `payment_status='paid'` regardless of the browser.
- User's next page load shows the credited points (SWR re-fetches).

**Gap:** none for the data-correctness path. UX-wise, no email confirmation if Resend fails (covered by F3).

## F5. AI provider fails (Anthropic + Groq + Gemini + OpenAI)

**Mitigations:** `chat-support` falls through 7 providers in order ([chat-support/index.ts:182-235](supabase/functions/chat-support/index.ts)). Final response is `503 No AI provider configured`.

**Gap:** if all providers go down, users get 503 with no friendly message. The UI should detect 503 and show "Live support is temporarily unavailable — please email support@diamondandjeweler.com instead."

## F6. Match-generate is slow / queue backs up

**Mitigations:**
- `0084_enqueue_active_roles_for_rematch.sql` — async queue.
- `0074_match_queue.sql` — backpressure.
- `0075_get_match_candidates.sql` — RPC encapsulates the heavy join.

**Gap:** no SLA timer per role. A role queued at T0 should yield matches within 5 min — but there is no alerting if queue depth grows.

**Suggested fix:** add a Sentry / Plausible custom event when queue depth > 100 or oldest pending > 10 min.

## F7. Database connection pool exhaustion

**Mitigations:** Supabase manages Supavisor (transaction-mode 6543, session-mode 5432) automatically.

**Gap:** Edge Functions all use direct connection (no pooler URL in `_shared/supabase.ts`). At 1k+ concurrent edge invocations, this could exhaust direct slots.

**Suggested fix:**
- For high-throughput functions (`urgent-priority-search`, `match-generate`, `chat-support`), switch the `adminClient()` factory to use the Supavisor connection pooler URL (the `aws-0-…pooler.supabase.com` flavour). Default Supabase JS client `createClient` accepts this URL.
- Verify with `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'PostgREST%';` under load.

## F8. Cloudflare Turnstile fails

**Mitigations:** the login + signup pages load Turnstile from `challenges.cloudflare.com`. If Cloudflare is down, the captcha won't render.

**Gap:** the form may be disabled without explanation.

**Suggested fix:** time out the Turnstile script after 5 s and either fall back to no-captcha (with rate limit + email-rate gating) or show "Security check unavailable — please try again in a moment."

## F9. Storage bucket fills up (resume uploads)

**Mitigations:**
- `file_size_limit = "10MiB"` per file.
- Supabase free tier: 1 GB; pro: 100 GB.

**Gap:** no automated quota alert. With 100k talents × 1 MB resume average = 100 GB.

**Suggested fix:** weekly cron measuring `SELECT pg_size_pretty(SUM(...))` for `storage.objects`; alert if > 80 GB.

## F10. JWT key rotation breaks signed sessions

**Mitigations:** Supabase signs all auth tokens with internal keys; rotation triggers automatic refresh.

**Gap:** if the team manually rotates the JWT secret in Supabase dashboard during production hours, every active session is invalidated. Users see 401s and must re-login.

**Suggested fix:** never rotate during business hours; if necessary, rotate during a maintenance window with banner pre-announced.

## F11. Cron job stops running

**Mitigations:** `cron.job` table can be queried for `last_run` per job.

**Gap:** no visibility outside SQL. A failed `match-expire` cron would silently leave matches stuck in flight.

**Suggested fix:**
- Edge function `cron-health` runs daily, reports any cron `last_run > schedule + 1 h` to Sentry.
- Or use Supabase Hooks UI alert.

## F12. Adversarial bulk signup (bot army)

**Mitigations:**
- Cloudflare Turnstile on signup.
- Supabase auth rate-limit on `/auth/v1/signup` (default 3/hr/IP).
- `enable_anonymous_sign_ins = false`.

**Gap:** a sophisticated attacker can pass Turnstile via real browsers + rotating IPs. No CAPTCHA defeats determined attackers — only delays them.

**Suggested fix:** monitor signup rate per hour; if > 200/h, auto-flip `system_config.signup_paused = true` and require admin manual unpause.

---

## Summary table

| ID | Risk | Have | Need |
|---|---|---|---|
| F1 | Supabase down | Error boundary | DegradedBanner hook |
| F2 | Webhook dropped | Idempotency, pending row | reconcile-stuck-purchases cron |
| F3 | Email fails | best-effort catch | notification_outbox + retry |
| F4 | User closes tab | Server-side webhook | (covered) |
| F5 | All AI down | 7 providers | 503 friendly UX |
| F6 | Match queue stalls | Backpressure | depth alert |
| F7 | DB pool exhausted | Supavisor | use pooler URL in edge fns |
| F8 | Turnstile fails | (none) | timeout + fallback |
| F9 | Storage full | per-file cap | weekly quota alert |
| F10 | JWT rotation | refresh handling | maintenance window only |
| F11 | Cron stops | cron.job table | health-check fn |
| F12 | Bot signups | Turnstile + rate limit | signup-pause auto-flag |
