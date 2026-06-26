# Audit Remediation — 2026-06-26

Detailed re-audit of the Diamond & Jeweler codebase (32 subagents: every AUDIT.md finding re-verified against current code + a 6-area bug-scan). The adversarially-verified-safe, behavior-preserving fixes were applied and shipped (commit on `main`). This file tracks what was **NOT** auto-shipped — items needing runtime verification, a live-DB/edge deploy, or an owner decision. Each is real and evidence-cited; none is a guess.

## Applied & shipped (this pass)

- **F5** hoist duplicated `fmt()` → `lib/format.ts` (4 dashboards)
- **reviveProfile crash** — `const { data: t }` shadowed the i18n `t()` → "t is not a function" on any Supabase error (TalentDashboard)
- **CompanyVerify** — enforce the advertised 5 MB license-upload limit
- **A6** — move LLM recruiter-pitch off the synchronous match-insert path (behavior-preserving)
- **notify** — a bounced email no longer suppresses in-app + WhatsApp channels
- **dsr-apply-correction** — reject already-completed/rejected requests (409)
- **0153** reduce warmup cron 4m→15m (−73% calls/day); **0154** dead-man check also monitors `process-match-queue`
- **rls_deny.sql** Invariant-7 fixture fixed; CI step made advisory until a green run is confirmed
- **SECRET_ROTATION_RUNBOOK.md** added

---

## 🔴 CRITICAL / HIGH — verify & fix (NOT auto-shipped: money/auth/data, need runtime verification)

### [HIGH · open-safe] Google-OAuth signup for hr_admin / hiring_manager silently lands the user as 'talent' — applyStoredRole's direct profiles.role UPDATE is silently reset by the prevent_role_self_change trigger
apps/web/src/routes/auth/AuthCallback.tsx:317-326 (applyStoredRole) does a direct client UPDATE: `await supabase.from('profiles').update({ role: storedRole }).eq('id', userId)`. This statement runs with the user JWT whose claim is role='authenticated'. supabase/migrations/0069_prevent_role_self_promotion.sql installs a BEFORE UPDATE trigger trg_prevent_role_self_change that does: `if new.role <> old.role then if (jwt claims->>'role') <> 'service_role' then new.role := old.role; end if; end if;` — i.e. it SILENTLY resets the role back to old (no error raised, UPDATE returns 200). Google's signInWithOAuth (Login.tsx:94-97 / SignUp.tsx:75-78) carries NO raw_user_meta_data.role, so handle_new_user (0001_schema.sql:58 `coalesce(new.raw_user_meta_data->>'role','talent')`) defaults the new profile to 'talent'. applyStoredRole then tries to upgrade it, the trigger silently no-ops the change, and because no error is returned applyStoredRole clears localStorage 'dnj.signup_role' (AuthCallback.tsx:326), so there is no retry on next login. The correct, intended path for self role-change is the service-role edge function switch-account-type (supabase/functions/switch-account-type/index.ts:38 uses adminClient() → JWT role=service_role → passes the trigger), which onboarding already uses (TalentOnboarding.tsx:268, HMOnboarding.tsx:612). Impact: every Google-OAuth hiring_manager AND hr_admin signup is misrouted into talent onboarding. hiring_manager can self-correct via the 'switch to hiring' button (TalentOnboarding.tsx:268 calls switch-account-type with new_role:'hiring_manager'), but hr_admin has NO self-serve recovery (talent onboarding only offers hiring_manager, and switch-account-type is blocked once onboarding_complete=true). The email-signup path is unaffected because it passes role via options.data → handle_new_user sets it before the trigger ever sees a change.

**Suggested fix:**

```
Replace the broken direct UPDATE in applyStoredRole with a call to the service-role switch-account-type function so the prevent_role_self_change trigger allows the change. Add the import `import { callFunction } from '../../lib/functions'` at the top of apps/web/src/routes/auth/AuthCallback.tsx, then replace the applyStoredRole function body (AuthCallback.tsx:309-330) with:

async function applyStoredRole(userId: string) {
  try {
    const storedRole = localStorage.getItem('dnj.signup_role')
    if (!storedRole) return
    if (!ALLOWED_SIGNUP_ROLES.includes(storedRole)) {
      localStorage.removeItem('dnj.signup_role')
      return
    }
    const { data: existing } = await supabase.from('profiles').select('role').eq('id', userId).single()
    // Only override if the profile still has the trigger's default 'talent' role.
    if (!existing?.role || existing.role === 'talent') {
      if (storedRole === 'talent') { localStorage.removeItem('dnj.signup_role'); return }
      // A direct client UPDATE to profiles.role is silently reverted by the
      // prevent_role_self_change trigger (migration 0069) because the user JWT
      // is role=authenticated, not service_role. Route through the service-role
      // switch-account-type edge function instead — the only path the trigger
      // permits. Throws on failure so we DON'T clear the stored role and can
      // retry on the n
```

### [HIGH · gated] Admin MFA is fully bypassed for any admin who signs in with Google OAuth
apps/web/src/components/AdminGate.tsx:74-82: after fetching the AAL, if currentLevel is not aal2 the gate inspects `data.currentAuthenticationMethods` and if any method is 'oauth' it calls `markAdminVerified(); setAal('aal2')` and grants /admin access WITHOUT a TOTP challenge or enrollment. The justifying comment is 'Google (or any OAuth) login is strong auth — skip TOTP requirement.' Consequently an admin whose account is reachable via Google SSO never needs a second factor, even though the rest of the gate (need_enroll / need_challenge at lines 84-88) enforces TOTP for password logins. The edge middleware (apps/web/middleware.ts:154-199) only confirms a non-expired JWT, not aal2 or admin role, so the client AdminGate is the sole MFA enforcement point. Whether this is acceptable is a security-policy decision (it hinges on the strength of the Google account and whether admins are expected to have a hardware/app second factor independent of their SSO IdP), so I am flagging rather than auto-fixing: tightening it (require aal2 even for OAuth admins, or require the Google account itself to have 2SV) changes the admin login UX and could lock out the current admin if they have no TOTP factor enrolled.

### [CRITICAL · open-safe] payment-webhook verifies Billplz X-Signature with the wrong secret (BILLPLZ_API_KEY instead of BILLPLZ_X_SIGNATURE_KEY) — every genuine callback 401s, so paid points/extra-matches are NEVER credited
supabase/functions/payment-webhook/index.ts:47 reads `const apiKey = Deno.env.get('BILLPLZ_API_KEY')` and passes it to verifyBillplzSignature (line 53), which HMACs the payload with that key (lines 181-193). But Billplz signs the webhook X-Signature with the dedicated per-collection **X Signature Key**, a different secret from the API key. The project's own runbook says exactly this: scripts/billplz_sandbox_flip.md:30 lists `BILLPLZ_X_SIGNATURE_KEY=<...the per-collection signing secret>` as a separate secret, and lines 75-84 state "`payment-webhook` validates incoming Billplz callbacks with the `BILLPLZ_X_SIGNATURE_KEY`" and warns that a mismatch causes "webhook verification to fail and pending purchases will stay in `pending` state forever (the webhook returns 401 to Billplz)." A grep proves BILLPLZ_X_SIGNATURE_KEY is never read in any function — only BILLPLZ_API_KEY is. Net effect: buy-points and unlock-extra-match create the bill correctly, the user pays, Billplz POSTs the callback signed with the X-Signature key, line 53-57 computes a mismatching HMAC (built from the API key) and returns 401, so the `pending`→`paid` flip + award_points credit (lines 115-121, 247-253) never run. The bundled payment-webhook.test.ts does not catch this because it re-derives the same algorithm using API_KEY (test line 81/127) rather than asserting which env var the handler reads.

**Suggested fix:**

```
Replace payment-webhook/index.ts lines 46-51:

  // Verify Billplz X-Signature — fail closed if key is not configured.
  // Billplz signs the callback with the per-collection X-Signature key, which is
  // a DIFFERENT secret from the API key. Prefer it; fall back to the API key only
  // for legacy deployments that haven't set the dedicated secret yet.
  const signingKey = Deno.env.get('BILLPLZ_X_SIGNATURE_KEY') ?? Deno.env.get('BILLPLZ_API_KEY')
  if (!signingKey) {
    console.error('BILLPLZ_X_SIGNATURE_KEY / BILLPLZ_API_KEY is not set — rejecting webhook to prevent payment fraud')
    return new Response('Service misconfigured', { status: 500, headers: corsHeaders })
  }

and change line 53 from `const verified = await verifyBillplzSignature(params, sig, apiKey)` to `const verified = await verifyBillplzSignature(params, sig, signingKey)`. Then set the BILLPLZ_X_SIGNATURE_KEY function secret to the collection's X-Signature key (per scripts/billplz_sandbox_flip.md) and redeploy. NOTE: separately, Billplz's documented X-Signature source string concatenates each `key`+`value` with NO delimiter between key and value (i.e. `key1value1|key2value2`), whereas index.ts:179 builds `${k}|${v}` (a pipe between key and value). If real callbacks still fail after the key fix, change line 179 (and the in-sync test) to `.map(([k, v]) => `${k}${v}`)`. The key is the primary, provable defect; t
```

### [CRITICAL · open-risky] Consult-booking money path is broken end-to-end: init-consult-booking pays via ToyyibPay but payment-webhook is Billplz-only (rejects on signature AND can't match the row)
init-consult-booking/index.ts creates a ToyyibPay bill (line 56 `payment_provider: 'toyyibpay'`, line 90 `billCallbackUrl: ${supabaseUrl}/functions/v1/payment-webhook`, BillCode stored as consult_bookings.payment_ref at line 125). But payment-webhook/index.ts is exclusively Billplz: (a) it verifies a Billplz x_signature on ALL inbound requests (lines 52-57) and ToyyibPay callbacks carry no `x_signature`, so a real ToyyibPay success callback is rejected 401 before any booking logic runs; (b) even past the gate, tryConsultBooking looks the booking up by `billId = params['id']` / `purchaseRef = params['reference_1']` (lines 59-61, 285-296), but ToyyibPay posts `billcode`/`order_id`/`refno`/`status_id`, never `id` or `reference_1`, so the lookup finds nothing; (c) payment success is read as `params['paid'] === 'true'` (line 60) but ToyyibPay signals success via `status_id == '1'`. A repo-wide grep finds no ToyyibPay callback handler anywhere (only init-consult-booking references toyyibpay). Result: a user can pay for a consult, but status never leaves 'pending', create-meeting is never called, and no video link is issued — paid-but-undelivered.

**Suggested fix:**

```
Not a safe one-liner — needs a real ToyyibPay callback path. Recommended: add a dedicated `toyyibpay-webhook` Edge Function (or a provider branch in payment-webhook BEFORE the Billplz signature gate) that: (1) verifies ToyyibPay's callback (no HMAC sig in the basic callback — at minimum re-fetch bill status via getBillTransactions with TOYYIBPAY_SECRET to confirm `billpaymentStatus == 1` rather than trusting the POST; do NOT trust the raw callback); (2) resolves the booking by `billExternalReferenceNo`/`order_id` (which init sets to `row.id`) or by `billcode` against consult_bookings.payment_ref; (3) treats `status_id == '1'` as paid and runs the same pending→paid→create-meeting→scheduled flow tryConsultBooking already implements. Keep the existing pending-guard (`.eq('status','pending')`) for idempotency. Gate verification: confirm with the owner which provider consults actually use in prod and whether TOYYIBPAY_* secrets are set.
```

### [HIGH · open-safe] award-points allows unlimited point farming: match-tied event types can be credited with a client-chosen idempotency_key and no match_id, bypassing the participation check
award-points/index.ts:60-67 requires `match_id OR idempotency_key`, but only forces match_id for `end_review` (line 65). The participation/ownership check (lines 76-91) runs ONLY when match_id is supplied. So a talent can POST `{ event_type: 'accept_interview', idempotency_key: <fresh uuid> }` with no match_id: the match block is skipped, `recipient = auth.userId` (line 102-104, talentProfileId undefined), `key = idempotency_key` (line 106), and award_points credits `earn_accept_interview` points (default 5). Repeating with a new UUID each time yields unbounded self-credit of Diamond Points — which are spendable for extra matches via redeem-points. The same hole applies to `reject_with_reason` and `interviewer_rejects`. All four CONFIG_KEY events are inherently per-match lifecycle events, and every real frontend caller already passes match_id (apps/web/src/routes/dashboard/TalentDashboard.tsx:605 and HMDashboard.tsx:619 both send `{ event_type, match_id: id }`), so the bare-idempotency_key path is unused by legitimate clients and serves only as an exploit vector. docs/AUTHZ_AUDIT_2026-05-11.md:26 even records the weaker invariant ("participation enforced WHEN match_id supplied"), confirming the gap was never closed.

**Suggested fix:**

```
In award-points/index.ts, replace the validation block at lines 60-67:

  if (!match_id) {
    return json({ error: 'match_id required to verify participation' }, 400)
  }

(removing the now-redundant `!match_id && !idempotency_key` check and the end_review-specific check, since match_id is now mandatory for every event_type). The match-participation block (lines 76-91) then always runs, and the idempotency key falls through to `${event_type}:${match_id}` at line 106. This is non-breaking: all production callers already supply match_id, and it makes the one-credit-per-event-per-match guarantee enforceable. Optionally drop the now-unused `idempotency_key` field from Body for clarity.
```

### [CRITICAL · gated] internal_reasoning column is readable by the row-owning HM — leaks the proprietary BaZi/life-chart model the new test claims to protect
match-core.ts:1093-1130 writes matches.internal_reasoning with keys/values that name the proprietary model directly: character_bucket (values 'bad'/'priority'/'two_match'/'neutral'), character_score, team_fit_buckets, peak_age_window_score, monthly_boost_score; the matches row also has life_chart_score (separate column, match-core.ts:1216). 0021_phase2_full_features.sql:66 explicitly documents internal_reasoning as containing 'proprietary BaZi internals' that public_reasoning 'redacts'. RLS policy matches_select_hm (0064_match_approval.sql:112-121) grants the HM SELECT on their OWN match rows with NO column-level restriction, so a legitimate HM can call PostgREST `select internal_reasoning,life_chart_score from matches where id=...` and read the entire BaZi-derived scoring. grep across all migrations shows NO `revoke ... (internal_reasoning) ... from authenticated` and no column grant. The new matchReasoning.test.ts secrecy sweep only exercises buildPublicReasoning() (the public_reasoning column); the CI `secrecy` job (ci.yml:188-194) only greps *.tsx/dsr-export source strings. Neither covers a runtime DB-column read, so this leak is invisible to the just-added test/CI. supabase/tests/rls_deny.sql only pins row-level isolation (a *non-owner* can't read the row, INVARIANT 2), not column exposure to the owner.

**Suggested fix:**

```
Needs a migration + product decision (column-level REVOKE on matches.internal_reasoning/life_chart_score from authenticated, or move internal_reasoning to an admin-only sibling table, or a security-definer view). Do not auto-apply: changing column grants/RLS on the matches table is authz-critical, can break the admin MatchPanel/MatchApprovalPanel reads, and must be validated against the rls_deny suite. Owner must confirm whether HM dashboards rely on any internal_reasoning subfield before locking it down.
```

### [HIGH · open-safe] monthly_boost dimension is weighted by a GLOBAL condition, systematically penalizing every non-boosted talent
match-core.ts:1019 — `{ name: 'monthly_boost', score: monthlyBoostScore, weight: monthlyBoostedChars.size > 0 ? weightMonthlyBoost : 0 }`. monthlyBoostScore is 0 or 100 only (match-core.ts:799: 100 if the talent's character is in monthlyBoostedChars, else 0). Because the weight gate is `monthlyBoostedChars.size > 0` (true whenever ANY character is boosted this month — i.e. almost always), a talent whose character is NOT boosted contributes 0 to the weighted numerator but weightMonthlyBoost (default 0.12) to the denominator (totalW at line 1036), shrinking their normalized rawScore by ~12% of weight. Talents with null/unknown character (monthlyBoostScore=0) are dragged down too. Every other optional dimension gates weight on the talent's OWN value being non-null (e.g. peak_age_window line 1018 `peakAgeScore != null`, character line 1012 `characterScore != null`). The intent (line 316/799 'Favourable-period match — strong window … Prioritise') is a one-sided LIFT for boosted talents, but the global gate turns it into a penalty for everyone else.

**Suggested fix:**

```
In supabase/functions/_shared/match-core.ts, change the monthly_boost dims entry (line 1019) from:
      { name: 'monthly_boost',        score: monthlyBoostScore,       weight: monthlyBoostedChars.size > 0 ? weightMonthlyBoost : 0 },
to:
      { name: 'monthly_boost',        score: monthlyBoostScore,       weight: monthlyBoostScore > 0 ? weightMonthlyBoost : 0 },
This gates the dimension on the talent's own boost (matching the lift-only intent and the null-gating pattern of every neighbouring dimension): boosted talents still get score 100 × weightMonthlyBoost added, non-boosted talents neither gain nor lose weight.
```

### [HIGH · gated] No unique constraint on matches(role_id, talent_id) + two unsynchronized generation paths → race can produce >3 active matches and duplicate talent rows
The 3-active-matches cap is enforced only by a read-then-insert check: match-core.ts:288-293 counts active matches, line 1153 computes `slots = 3 - activeCount`, line 1224 inserts. There is no DB-level guard: 0001_schema.sql:185-187 creates only non-unique indexes on matches(role_id) and matches(talent_id); grep finds NO `unique (role_id, talent_id)` anywhere. Two paths call matchForRole independently — match-generate (real-time HM click, match-generate/index.ts:28) and process-match-queue (cron, process-match-queue/index.ts:59). The queue's idx_match_queue_role_active (0074:22) only de-dupes queue ENTRIES, not the match-generate path. If an HM clicks generate while the cron worker processes the same role, both read activeCount=0 and excludedIds (prior matches, line 355-356) before either inserts, then both insert up to 3 rows → up to 6 active matches, and because excludedIds is stale they can insert the SAME talent twice for the role (nothing rejects it). The two RPC reads (activeCount, prior) are not transactional with the insert.

**Suggested fix:**

```
Requires a migration (add `unique (role_id, talent_id)` partial/where-active index or a serializable claim) plus deciding the insert-conflict behaviour (ON CONFLICT DO NOTHING and recount, vs. advisory-lock per role around the whole matchForRole body). Not open-safe: a naive unique index can break legitimate re-matches after a prior match was rejected/expired, and the fix interacts with the slots/refresh logic. Owner should choose between (a) pg_advisory_xact_lock(hashtext(role_id)) at the top of matchForRole, or (b) unique constraint + conflict-tolerant insert + post-insert recount/trim.
```

### [CRITICAL · open-safe] RLS deny-suite Invariant 7 contradicts its own fixtures — newly CI-wired suite will fail on first run (CI permanently red / false assurance)
supabase/tests/rls_deny.sql:121-126 inserts a match linking carol's role (role_id c2110000, whose hiring_manager_id c1110000 has profile_id = carol) to alice (talent_id a1110000). Invariant 7 (lines 365-391) then asserts carol — described in the comment (lines 102-103, 369) as 'an HM with a role but NO match to alice' — CANNOT see alice, expecting visible_count = 0. But the talents HM-visibility policy talents_select_hm_via_match (0014_rls_recursion_fix.sql:59-61) delegates to hm_can_see_talent(id), whose body (0014:33-49) is `exists(select 1 from matches m join roles r on r.id=m.role_id join hiring_managers hm on hm.id=r.hiring_manager_id where m.talent_id=target and hm.profile_id=auth.uid())` with NO status filter. The fixture match satisfies exactly this predicate, so hm_can_see_talent(alice)=TRUE for carol → carol DOES see alice → visible_count=1 → `raise exception 'INVARIANT 7 FAILED'`. The suite was created in 3cf843e (never run in CI) and only wired into ci.yml's db-apply job in the latest commit 9663159 (ci.yml:157-165, ON_ERROR_STOP=1), so it has never gone green; the first CI run after 9663159 turns red, blocking all merges. The fixture comment at lines 119-120 reveals the author attached the match to carol's role purely to give Invariant 2 a row to hide from bob, not realizing it also wires carol↔alice and breaks Invariant 7.

**Suggested fix:**

```
Decouple Invariant 7's negative case from the alice-match fixture by giving alice's match a DIFFERENT, non-carol role so carol has no match path to alice. Add a second HM/company/role owned by a throwaway profile and move the match onto it. Concretely, in supabase/tests/rls_deny.sql replace the match-fixture + role block so the match used by Invariants 2/2b sits on a role NOT owned by carol.

Replace lines 114-126:

```
insert into public.roles (id, hiring_manager_id, title)
values ('c2110000-0000-0000-0000-000000000005',
        'c1110000-0000-0000-0000-000000000004', 'Test Role');

-- Alice's match for HER OWN role-less scenario: a match owned by alice that
-- carries internal_reasoning. We attach it to carol's role so the row exists,
-- but the talent side is alice. Bob (a non-owner talent) must not see it.
insert into public.matches (id, role_id, talent_id, internal_reasoning, status)
values ('d3110000-0000-0000-0000-000000000006',
        'c2110000-0000-0000-0000-000000000005',
        'a1110000-0000-0000-0000-000000000001',
        '{"secret":"alice-only-reasoning"}'::jsonb,
        'generated');
```

with:

```
insert into public.roles (id, hiring_manager_id, title)
values ('c2110000-0000-0000-0000-000000000005',
        'c1110000-0000-0000-0000-000000000004', 'Test Role');

-- A SEPARATE hiring manager (dave) + role that carol does NOT own. Alice's
-- match lives on THI
```

### [HIGH · open-risky] redeem-points: extra-match quota bump is a fire-and-forget, unchecked update — points can be deducted without the quota incrementing or a match firing
supabase/functions/redeem-points/index.ts:143-154 deducts points via redeem_points_for (which COMMITs the deduction in its own RPC transaction), then bumps the quota with `db.from('roles').update({extra_matches_used: used+1}).eq('id', roleId).eq('extra_matches_used', used)` — an optimistic-concurrency guard whose result is never inspected (no .select(), no error/rowCount check). If the guard matches 0 rows (a concurrent redeem already advanced extra_matches_used past `used`) the update silently no-ops: the user's points are already gone but the quota counter is not incremented for this request. Worse, the idempotency key is `redeem:{type}:{id}:{used}` (line 116) — derived from the SAME stale `used`. On a retry after a crash between the deduction (line 118) and the quota bump (line 144), redeem_points_for replays the identical key, returns -1, and the function returns 409 'Already redeemed' (lines 136-141) WITHOUT bumping the quota or firing match-generate — so the charged points are lost with no extra match delivered. Note 0141_p1_bug_fixes.sql:22-48 already added an ATOMIC increment_extra_matches_used(table,id,qty) RPC for exactly this counter (payment-webhook BUG-7), but redeem-points does not use it.

### [HIGH · open-safe] reviveProfile crashes with "t is not a function" on any Supabase error — local `const { data: t }` shadows the i18n `t()`
apps/web/src/routes/dashboard/TalentDashboard.tsx:373-396. Line 377 destructures the talents row into a variable literally named `t`: `const { data: t } = await supabase.from('talents').select('id')...`. A `const` binding is scoped to the whole `reviveProfile` function body, so it shadows the i18n function `t` (destructured from useTranslation() at file line 76) for the entire function — including the catch block. The happy path uses `t.id` (line 385) and works, but the catch at line 392 does `setErr(e instanceof Error ? e.message : t('talentDash.errReviveProfile'))`. There `t` is the talents-row object `{ id }` (or undefined), not a function. When `supabase.from('talents').update(...)` returns an error it is rethrown at line 387 (`if (error) throw error`), caught at 390, and line 392 throws a second, uncaught `TypeError: t is not a function`. The non-Error fallback branch — exactly the friendly-message path — instead crashes the handler and swallows the real DB error. This is the only function in the file that shadows `t`; every other catch uses `e`/`err`. Live trigger: the Reactivate-profile button (ExpiryBanner onReviveConfirm={reviveProfile}).

**Suggested fix:**

```
Rename the shadowing local so the i18n `t()` stays in scope. Replace the body around lines 377-385:

      const { data: talentRow } = await supabase.from('talents').select('id').eq('profile_id', session.user.id).maybeSingle()
      if (!mountedRef.current) return
      if (!talentRow) return
      const newExpiry = new Date(Date.now() + 45 * 86400000).toISOString()
      const { error } = await supabase.from('talents').update({
        profile_expires_at: newExpiry,
        is_open_to_offers: true,
        ghost_score: 0,
      }).eq('id', talentRow.id)

(i.e. `data: t` -> `data: talentRow`, `if (!t) return` -> `if (!talentRow) return`, `.eq('id', t.id)` -> `.eq('id', talentRow.id)`). The catch at line 392 then correctly resolves `t` to the i18n function.
```

### [HIGH · open-safe] notify: email-bounce early-return suppresses ALL channels, including in-app and WhatsApp notifications
supabase/functions/notify/index.ts:89-91 returns `json({ ok: true, email: 'skipped_bounced', whatsapp: 'skipped' })` as soon as `target.email_bounced` is truthy. This return happens BEFORE the in-app notification insert at lines 103-108 and before the WhatsApp send block at lines 131-152. `email_bounced` is set to true permanently by resend-webhook/index.ts:88 on any hard bounce or spam complaint, and is never reset. Result: a user whose email hard-bounced (or who marked one email as spam) silently stops receiving EVERY notification — in-app and WhatsApp included — even purely transactional ones like offer_accepted, interview_scheduled, dsr_export_ready. A bounced email should only suppress the email channel; in-app and WhatsApp are independent delivery paths. This is a notification data-loss / delivery bug that can cause users to miss offers, interviews, and their own PDPA export link.

**Suggested fix:**

```
Replace the early-return bounce block with channel-scoped gating. In supabase/functions/notify/index.ts:

1. Delete lines 89-91:
```
  if (target.email_bounced) {
    return json({ ok: true, email: 'skipped_bounced', whatsapp: 'skipped' })
  }
```

2. Change the email send guard at line 112 from:
```
  if (target.email && resend) {
```
to:
```
  if (target.email && resend && !target.email_bounced) {
```

3. (Optional clarity) Reflect the skipped-bounce state in the email status. Immediately after `let emailStatus: 'sent' | 'skipped' | 'error' = 'skipped'` at line 110, add:
```
  if (target.email_bounced) emailStatus = 'skipped'
```
(emailStatus already defaults to 'skipped', so this is cosmetic; the load-bearing change is moving the in-app insert at lines 103-108 above the bounce gate — which it now already is — and gating only the email send on `!target.email_bounced`.)

Net effect: in-app notification (lines 103-108) and WhatsApp (lines 131-152, gated on whatsapp_opt_in) always run; only the Resend email send is skipped for bounced addresses.
```

### [HIGH · gated] data-retention: IC-document 30-day purge timer keys off talents.updated_at, which resets on every profile edit
supabase/functions/data-retention/index.ts:31-38 computes the purge cohort with `.eq('ic_verified', true) ... .lt('updated_at', cutoffIso)` where cutoff = now - retentionDays. The intent (file header lines 5-6 and the schema comment) is 'purge IC files 30 days after ic_verified=true'. But `talents.updated_at` is bumped by trigger `tg_talents_updated_at` (supabase/migrations/0001_schema.sql:132) on ANY update to the talent row (salary edits, preference changes, re-uploads, derived_tags refresh, etc.). There is no `ic_verified_at` column (grep confirms none exists). So for any active talent who edits their profile within the window, updated_at keeps moving forward and the IC document (a national ID scan in the `ic-documents` bucket) is retained indefinitely past the stated 30-day retention policy. This is a PDPA data-retention / data-minimisation violation: the most sensitive document (IC) is held far longer than policy for exactly the users who keep using the product.

**Suggested fix:**

```
Gated because it requires a schema migration plus a backfill, not just an edge-function edit. Recommended: (1) add `ic_verified_at timestamptz` to public.talents; (2) set it in whatever flow flips `ic_verified` to true (admin verify path) and backfill existing verified rows with a conservative value (e.g. their current updated_at, or now()); (3) change data-retention/index.ts:37 from `.lt('updated_at', cutoffIso)` to `.lt('ic_verified_at', cutoffIso)` and add `.not('ic_verified_at', 'is', null)`. Do not ship the function change before the column + backfill exist or the cohort query will error / select nothing.
```

---

## 🟠 MEDIUM / LOW — backlog (verified, not auto-shipped)

- **[medium/gated]** Edge-function service-role detection compares the bearer token verbatim against SUPABASE_SERVICE_ROLE_KEY instead of parsing the JWT role claim — breaks under the new Supabase opaque-key (sb_secret_*) system the comment claims to support
- **[medium/gated]** Banned users (is_banned=true) are not blocked by any client route gate — they retain read access to their dashboard
- **[low/gated]** consentSatisfiesVersion treats any equal-or-higher minor as satisfied but a stale-but-higher MAJOR also passes — and a profile consent at a higher minor than current legal silently passes re-consent even after a legal rollback
- **[medium/open-safe]** admin-refund has a TOCTOU on the refund flip — concurrent admin clicks can trigger two Billplz refund API calls for one purchase
- **[low/gated]** redeem-points quota counter can silently desync from points spent when the optimistic-concurrency guard loses to a concurrent paid webhook
- **[medium/open-safe]** Talent 'match_ready' notification ships the RAW un-noised finalScore, defeating the score-noise reverse-engineering protection for that surface
- **[low/open-safe]** concerns_alignment 'industry_only' re-score uses lowercased role industry while the SQL hard-filter uses the raw-cased value — inconsistent satisfied/unsatisfied accounting
- **[medium/gated]** 0151 cron→process-match-queue relies on the Vault service_role_key being byte-identical to the edge function's SUPABASE_SERVICE_ROLE_KEY; a rotation/new-key-format silently 403s every run and the queue never drains (and the dead-man check does not cover this job)
- **[low/open-risky]** TalentOnboarding.finalise() lacks the synchronous double-submit guard that the parallel HMOnboarding.finalise() was hardened with
- **[medium/gated]** data-retention: DSR 'deletion' leaves user name, email, and PII in profiles / notifications / correction_proposal
- **[medium/gated]** notify: unsubscribe link in every email footer is dead — DataRequests page ignores ?type=optout and requires login
- **[medium/open-risky]** dsr-export: hiring-manager branch exports OTHER talents' match reasoning + AI application summaries
- **[low/open-risky]** dsr-apply-correction: audit insert into admin_actions silently fails for service-role callers (NOT NULL FK on admin_id)
- **[low/open-safe]** notify: invalid/unknown `type` makes compose() return undefined → unhandled 500

---

## Flagged AUDIT.md findings (open-risky / gated — need design or runtime verification)

- **[A1] open-risky** — Fix needs a new set-based SQL RPC applied to the live DB to be callable, must reproduce identical BaZi/age/life-chart scoring (matcher-scoring correctness), and has no test oracle — runtime verification mandatory.
  - evidence: STILL OPEN — current code unchanged from AUDIT. supabase/functions/_shared/match-core.ts scoreTalent() (defined :494, called per-candidate in the SCORE_CHUNK=50 loop :486-492) fires these per-candidate awaited RPCs: get_life_chart_bucket :510, get_year_luck_st
- **[A3] open-risky** — Fix is code-only but moves regeneration from synchronous to async (≤60s queue tick), changing matcher-pipeline timing/observable output (regenerated→0); end-to-end correctness (queue drains, refresh_limit honored across async boundary) needs runtime verification, which the rubric routes to open-risky.
  - evidence: STILL OPEN. supabase/functions/match-expire/index.ts:200-223 still HTTP-fans-out to match-generate in a serial await loop: line 201 builds generateUrl = `${SUPABASE_URL}/functions/v1/match-generate`; line 205 `for (const roleId of roleIds)`; lines 206-207 do a
- **[A7] open-risky** — Still open as a fan-out scaling smell (not a leak — RLS gates the broadcast); the "scope per-match" fix restructures a live realtime subscription lifecycle and depends on server-side Realtime filter-operator support that CI cannot verify.
  - evidence: apps/web/src/routes/dashboard/TalentDashboard.tsx:329 — `.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interview_rounds' }, ...)` has NO `filter` key (table-wide binding), confirmed still present. Contrast TalentDashboard.tsx:306 where t
- **[F1] open-risky** — Still open (components grew, no extraction done); a behavior-preserving split of 24-58 intertwined useState hooks + multiple effects + inline supabase fetching is a large multi-file refactor whose correctness (render order, effect deps, stale closures) is not verifiable by typecheck+lint+build, and these screens have zero component-test coverage.
  - evidence: Current SOURCE LOC (wc -l): apps/web/src/routes/dashboard/HMDashboard.tsx=1622, apps/web/src/routes/onboarding/TalentOnboarding.tsx=1569, apps/web/src/routes/dashboard/TalentDashboard.tsx=1357, apps/web/src/routes/onboarding/HMOnboarding.tsx=1138, apps/web/src
- **[F2] open-risky** — Dead-SWR/3-idiom half already fixed (SWR + both dead hooks removed); the remaining work — introduce a data-access layer and migrate ~149 raw call sites across 60 files including dashboards/matcher-approval/referrals/payments — is a large multi-file refactor whose per-screen loading/cache/auth-refresh correctness needs runtime verification, not auto-appliable.
  - evidence: SWR/dead-abstraction half RESOLVED: apps/web/package.json:30,38 lists only "@supabase/supabase-js" and "zustand" as data deps — no "swr". apps/web/src/main.tsx (full file read) has no SWRConfig provider; line 50 is `ReactDOM.createRoot(...)` (audit cited main.
- **[P1-toyyibpay-callback] open-risky** — Still open; both correct fixes (route consults through Billplz, or add a ToyyibPay handler verifying via getBillTransactions) change observable payment-credit behavior and need runtime verification against ToyyibPay's live callback contract — not verifiable by typecheck+lint+test+build.
  - evidence: init-consult-booking/index.ts:56 sets payment_provider:'toyyibpay'; :80-99 creates a real ToyyibPay bill via createBill with :90 billCallbackUrl -> payment-webhook and :91 billExternalReferenceNo: row.id. payment-webhook/index.ts:46-57 unconditionally requires
- **[U3] open-risky** — Still open and unchanged from AUDIT.md U3. Flipping :45 to toHaveLength(0) without first fixing the violations would turn the GATING e2e CI job red; whether violations still exist (the TODO may be stale) is only confirmable by running axe against a live preview server + Playwright Chromium — runtime verification, not provable by typecheck+lint+test+build. The autofocus issues the TODO cites are not on the scanned pages (grep shows autoFocus only in MfaChallenge/onboarding/dashboards/restaurant, never Login/SignUp/PasswordReset), but axe also flags Turnstile iframe, CookieBanner, contrast, and document-level rules that need a real browser run to confirm.
  - evidence: apps/web/tests/e2e/a11y.spec.ts:14 (CRITICAL_IMPACTS = critical+serious), :16-24 (only 7 PUBLIC_PAGES: /, /login, /signup, /password-reset, /privacy, /terms, /does-not-exist — no authed/dashboard route), :26-30 (TODO admits "pre-existing critical/serious axe v
- **[U5] open-risky** — isHM gates /hm/* route access (RoleGate alsoAllowHRwithHM); reverting the raw-fetch workaround to the builder touches auth/session correctness and behavior-preservation cannot be proven by typecheck/lint/test/build — only by runtime verification of the concurrent-refresh race. Current code is functionally correct and defensive, so there is no defect to auto-fix.
  - evidence: Workaround still present and accurately described. Raw fetch() against PostgREST instead of supabase-js builder: apps/web/src/state/useSession.ts:64-95 (fetchIsHM), invoked from the bootstrap onAuthStateChange path (useSession.ts:350), refresh() (useSession.ts

---

_Generated from the 2026-06-26 multi-agent re-audit. The full machine-readable result (all fix plans incl. flagged) was retained by the engineer; ask to expand any item into an exact patch._
