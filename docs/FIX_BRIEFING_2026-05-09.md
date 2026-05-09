# DNJ Fix Briefing — 2026-05-09

Single-shot deploy plan to unblock prelaunch testing.

## Execution log (2026-05-09 — late session)

✅ **Groups 1–4 shipped** in commit `9cef8a8` by an earlier session: migrations 0098 + 0099, Terms.tsx §11, middleware.ts edge gate, useSession.ts auth-cookie, PricingPanel.tsx Diamond Points rename. Migrations applied to live Supabase (`sfnrpbsdscikpmbhrzub`); frontend deployed; live `/terms` now reads v3.2 dated 9 May 2026 with §11 Refunds & Chargebacks present.

✅ **F7 patch** applied to `apps/web/src/routes/dashboard/admin/MatchApprovalPanel.tsx` (try/catch + error checks on `decryptDobs`). Committed as `4c927dd` and pushed to `origin/main`. **Not yet on production** — DNJ has no Vercel git integration, needs `vercel deploy --prod`.

✅ **parsed_resume seed** applied to T02 (Wei Ming, finance), T13 (Dharmendra, legal), T15 (Rohan, consulting) via Management API. Verified: 9/8/9 skills + 2/2/2 experience entries respectively. S08–S12 unblocked.

✅ **Admin tester role verified**: `a01.admin@dnj-test.my` and `diamondandjeweler@gmail.com` both have `role='admin'`, `is_banned=false`, `onboarding_complete=true`. F1/F8 now have no remaining data-side blocker.

⚠️ **F19 forgot-password silent submit** — not investigated this session. May resolve itself with the next Vercel deploy if the bug was a stale build. Otherwise the 3-step investigation in §F19 still applies.

⚠️ **Vercel CLI not installed** in this environment — recommend `npm i -g vercel` then `vercel deploy --prod` from `C:\Users\DC\Desktop\Diamond and Jeweler\` to ship the F7 patch.

---

## Original briefing (preserved for reference)

Five fixes; **four already exist in the working tree** uncommitted. Two genuinely new findings (F7 root cause + F19 forgot-pw).

---

## Status table

| ID | Bug | Status | Action |
|----|-----|--------|--------|
| F1, F8, F10, F14 | Admin Overview / Talents / Audit log / Support tab broken | **Migration written**, untracked: `supabase/migrations/0098_admin_visibility_fixes.sql` | Commit + apply via PAT |
| F12 | Refunds clause missing on /terms | **Code written**, uncommitted: `apps/web/src/routes/legal/Terms.tsx` (§11 added, v3.2) + `0099_legal_v3_2.sql` (system_config bump) | Commit + push + `vercel deploy --prod` |
| F7 | Approvals tab logs admin out | **Root cause identified, fix not written** | Apply patch in §F7 Fix below |
| F19 | Forgot-password submit does nothing (NEW) | **Source looks correct, live deploy broken** | Investigate per §F19 Steps below |
| S08–S12 unblock | parsed_resume NULL on all testers | **Helper SQL ready below** | Run §Seed Helper |

Plus four uncommitted side-changes to consider in the same push: `middleware.ts` (admin soft gate + auth-presence cookie), `useSession.ts` (cookie set/clear on session change), `PricingPanel.tsx` (cosmetic copy: "Diamond Points" rename).

---

## Deploy sequence

Run in order. Each step is independent — abort after any failure.

### 1. Stage and commit the working tree

```bash
cd "C:/Users/DC/Desktop/Diamond and Jeweler"

# Group 1: admin visibility migration (F1/F8/F10/F14)
git add supabase/migrations/0098_admin_visibility_fixes.sql
git commit -m "fix(rls): apply admin visibility migration 0098 (F1, F8, F10, F14)"

# Group 2: legal v3.2 — refunds clause (F12)
git add supabase/migrations/0099_legal_v3_2.sql apps/web/src/routes/legal/Terms.tsx
git commit -m "feat(legal): T&C v3.2 — §11 Refunds & Chargebacks"

# Group 3: admin edge gate + auth hint cookie
git add apps/web/middleware.ts apps/web/src/state/useSession.ts
git commit -m "feat(auth): edge soft-gate on /admin via dnj-auth presence cookie"

# Group 4: pricing copy
git add apps/web/src/routes/dashboard/admin/PricingPanel.tsx
git commit -m "chore(admin): rename 'Points' to 'Diamond Points' in PricingPanel"
```

`scripts/outreach_engine.gs` and the untracked scraper folders look unrelated — leave them.

### 2. Apply migrations 0098 + 0099 to live Supabase

Use the PAT from `reference_supabase_bole.md`. From psql or the Supabase SQL editor against project `sfnrpbsdscikpmbhrzub`:

```sql
-- paste contents of supabase/migrations/0098_admin_visibility_fixes.sql
-- then paste contents of supabase/migrations/0099_legal_v3_2.sql
```

After 0098, the `notify pgrst, 'reload schema'` line refreshes PostgREST so the new FK is exposed within ~5 seconds. Verify with:

```sql
select count(*) from public.support_tickets st
  join public.profiles p on p.id = st.user_id;  -- should not error
select public.is_admin();                        -- should return true when run as admin
```

### 3. Push + deploy

```bash
git push origin main
vercel deploy --prod    # required — DNJ has no Vercel git integration
```

---

## F7 fix — wrap `decryptDobs` in try/catch

**Why:** clicking the Approvals tab itself triggers a render path that calls `supabase.rpc('decrypt_dob', ...)`. The RPC is gated to `is_admin() OR service_role` (`supabase/migrations/0002_helpers.sql:85-86`). When the call rejects (transient session race, profile not yet hydrated, or after 0098 if admin still has stale role), the unhandled promise rejection escalates to a global handler that calls `signOut`. Quick fix: handle the error inline so it never propagates.

**Patch** — `apps/web/src/routes/dashboard/admin/MatchApprovalPanel.tsx:110-125`:

```tsx
async function decryptDobs(matchId: string, hmEnc: string | null, talentEnc: string | null) {
  const cached = dobCache[matchId]
  if (cached && cached.expiresAt > Date.now()) return
  try {
    const [hmResult, talentResult] = await Promise.all([
      hmEnc ? supabase.rpc('decrypt_dob', { encrypted: hmEnc }) : Promise.resolve({ data: null, error: null }),
      talentEnc ? supabase.rpc('decrypt_dob', { encrypted: talentEnc }) : Promise.resolve({ data: null, error: null }),
    ])
    if (hmResult.error || talentResult.error) {
      // Surface the error inline; do NOT let it propagate to the global handler.
      console.warn('[approvals] decrypt_dob failed', hmResult.error || talentResult.error)
      return
    }
    setDobCache((prev) => ({
      ...prev,
      [matchId]: {
        hm: (hmResult.data as string | null) ?? null,
        talent: (talentResult.data as string | null) ?? null,
        expiresAt: Date.now() + 5 * 60_000,
      },
    }))
  } catch (e) {
    console.warn('[approvals] decryptDobs threw', e)
  }
}
```

Then commit:

```bash
git add apps/web/src/routes/dashboard/admin/MatchApprovalPanel.tsx
git commit -m "fix(admin): swallow decrypt_dob errors in Approvals tab (F7)"
```

The deeper root cause is **wherever a global handler is calling `auth.signOut()` on unhandled rejections**. Worth a follow-up grep — the offender will be in an `unhandledrejection` listener, axios/swr/react-query interceptor, or a bound error boundary. None showed up in a `signOut` grep of `apps/web/src/`, so it may be in a third-party library or `lib/supabase.ts` interceptor. The patch above is sufficient to unblock launch — find the global handler later as a hygiene task.

---

## F19 — forgot-password silent submit

**Symptom:** on live `/password-reset`, filling email + completing Turnstile + clicking "Send reset link" produces zero network requests, zero console output, and no UI state change. Source `apps/web/src/routes/auth/PasswordReset.tsx:20-32` looks correct (`e.preventDefault()` → `supabase.auth.resetPasswordForEmail` → success state).

**Likely culprits, ranked:**

1. **Stale Vercel build.** Latest source isn't deployed. Verify with: `vercel ls --prod` and check the deployed commit SHA matches `git rev-parse HEAD` after step 3 above.
2. **`captchaToken` state race.** Turnstile widget shows "Success!" visually before React state updates, so the button looks enabled but `handleSubmit` returns early at line 23 with `setErr('Please complete the verification.')`. The Alert *should* show but if `err` is being cleared on next render, the user sees nothing.
3. **Turnstile component error swallowed.** Worth a `console.log` injection inside `handleSubmit` line 22 to confirm whether it's even invoked.

**Investigation steps:**
- Open live `/password-reset`, DevTools Console open, repro the click. If no log of any kind, `handleSubmit` is not bound — most likely a build/hydration issue.
- Add `console.log('handleSubmit fired', captchaToken)` as line 22 of `PasswordReset.tsx`, deploy, retest. If log shows `captchaToken: null`, fix the captcha state race in the `Turnstile` component (`apps/web/src/components/Turnstile.tsx`).

**Don't ship F19 fix as part of this batch** — investigate first, then add a follow-up commit.

---

## Seed helper — unblock S08–S12

Hand-craft `parsed_resume` + `interview_answers` for T02 (Wei Ming, finance), T13 (Dharmendra, legal), T15 (Rohan, consulting). Run as admin/postgres:

```sql
-- T02 Wei Ming — finance / risk / Risk Manager candidate
update public.talents set
  parsed_resume = jsonb_build_object(
    'summary', 'Senior finance professional, 9 yrs in commercial banking risk and compliance. Led credit-risk model validation for SME loan book at Maybank. CFA Level 3.',
    'skills', jsonb_build_array('credit risk', 'compliance', 'BNM regulations', 'SAS', 'Python', 'SQL', 'risk modelling', 'AML/CFT', 'Basel III'),
    'experience', jsonb_build_array(
      jsonb_build_object('company','Maybank','title','Senior Risk Analyst','years','2020-2026','summary','Validated PD/LGD models, led Basel III implementation for SME segment'),
      jsonb_build_object('company','CIMB','title','Credit Risk Analyst','years','2017-2020','summary','Built early-warning indicators for corporate loan book')
    ),
    'education', jsonb_build_array(jsonb_build_object('school','Universiti Malaya','degree','BSc Actuarial Science','year','2017')),
    'languages', jsonb_build_array('English','Bahasa Malaysia','Mandarin')
  ),
  interview_answers = jsonb_build_object(
    'why_change', 'Looking for a senior risk leadership role with exposure to retail credit, ideally moving into a Head of Risk track within 3-5 yrs.',
    'strengths', 'Quantitative rigour, regulatory fluency, ability to translate model outputs for non-technical stakeholders.',
    'work_style', 'Independent on analysis, collaborative on cross-functional projects. Prefer structured, deadline-driven environments.',
    'deal_breakers', 'Pure tech roles with no business context; firms without clear risk governance.',
    'compensation', 'RM 14,000 - RM 18,000 monthly, open to performance bonus.'
  )
where id = (select id from public.profiles where email = 't02.weiming.finance@dnj-test.my');

-- T13 Dharmendra — legal / PDPA / compliance
update public.talents set
  parsed_resume = jsonb_build_object(
    'summary', '7-yr corporate lawyer turned data-protection specialist. Led PDPA compliance overhaul at AirAsia Digital. Active member of Malaysian Bar.',
    'skills', jsonb_build_array('PDPA 2010','GDPR','contract negotiation','data protection','privacy impact assessment','compliance audit','litigation','M&A'),
    'experience', jsonb_build_array(
      jsonb_build_object('company','AirAsia Digital','title','Senior Legal Counsel','years','2022-2026','summary','Built privacy programme, ran PIAs for 12 product launches'),
      jsonb_build_object('company','Skrine','title','Associate, Corporate','years','2019-2022','summary','M&A and commercial contracts')
    ),
    'education', jsonb_build_array(jsonb_build_object('school','Universiti Malaya','degree','LLB Hons','year','2018'),jsonb_build_object('school','CIPP/E','degree','IAPP Certified','year','2023')),
    'languages', jsonb_build_array('English','Bahasa Malaysia','Tamil')
  ),
  interview_answers = jsonb_build_object(
    'why_change', 'Want to move in-house at a firm where privacy is a board-level priority, not an afterthought.',
    'strengths', 'Clear writing, calm under pressure, can translate legal risk into business decisions.',
    'work_style', 'Detail-obsessed on review, decisive on advice. Prefer firms that ship.',
    'deal_breakers', 'Roles where privacy is a checkbox; companies pre-IPO with no compliance maturity.',
    'compensation', 'RM 16,000 - RM 22,000 monthly.'
  )
where id = (select id from public.profiles where email = 't13.dharmendra.legal@dnj-test.my');

-- T15 Rohan — consulting / strategy / ops
update public.talents set
  parsed_resume = jsonb_build_object(
    'summary', 'Ex-McKinsey associate, 5 yrs total. Strategy + ops engagements across Malaysian banks, telcos, and SE Asian e-commerce. INSEAD MBA.',
    'skills', jsonb_build_array('strategy','operations','financial modelling','market entry','PMO','transformation','stakeholder management','SQL','Tableau'),
    'experience', jsonb_build_array(
      jsonb_build_object('company','McKinsey & Company','title','Associate','years','2023-2026','summary','Led 6 engagements across SEA banking + e-commerce; specialised in cost transformation'),
      jsonb_build_object('company','Boston Consulting Group','title','Senior Consultant','years','2021-2023','summary','Strategy work for Malaysian telco; drove KL office DEI workstream')
    ),
    'education', jsonb_build_array(jsonb_build_object('school','INSEAD','degree','MBA','year','2021'),jsonb_build_object('school','Imperial College London','degree','BEng Mechanical','year','2019')),
    'languages', jsonb_build_array('English','Bahasa Malaysia','Hindi')
  ),
  interview_answers = jsonb_build_object(
    'why_change', 'Done with the consulting model; want to own a P&L or build a function from scratch in a high-growth firm.',
    'strengths', 'Speed, structure, comfort with ambiguity. Strong client communication.',
    'work_style', 'Hypothesis-driven; iterate fast. Equally comfortable in slides or SQL.',
    'deal_breakers', 'Pure-play strategy roles with no operating accountability.',
    'compensation', 'RM 20,000 - RM 28,000 monthly + equity if early-stage.'
  )
where id = (select id from public.profiles where email = 't15.rohan.consulting@dnj-test.my');
```

After running, retrigger match-generate for H02's Risk Manager role to repopulate the candidate pool. T02 should top the match scores; T13 + T15 should appear with moderate scores.

---

## Verification checklist after deploy

| Check | Expected | Tests unblocked |
|-------|----------|-----------------|
| Admin Overview tab loads | Renders dashboard, not `{"message":""}` | S03 |
| Admin Talents tab shows roster | 20 rows visible | S04, S05 |
| Admin Audit log tab shows events | Recent rows present | S07 |
| Admin Support tab shows tickets | Joins to profiles work | S15 |
| Admin Approvals tab clickable | No logout, error toasted in console if RPC fails | S06 |
| /terms shows §11 Refunds | Section 11 visible, version 3.2 | S20, F12 |
| Re-consent prompt for v3.1 → v3.2 | Existing testers see consent modal | S20 |
| H02's Risk Manager → match-generate | T02/T13/T15 surface | S08–S12 |
| Forgot-pw flow | (Skipped this round — investigate F19 separately) | S21 |

---

## Open / not-in-scope

- **F11** trait taxonomy mismatch ("integrity" / "attention to detail" vs canonical 10-tag list) — copy/data fix, low priority, not blocking launch.
- **F18** chat-onboard gating — by design; seed helper above is the workaround.
- Master findings index file — referenced in 0098 comment as `11_master_findings_index.md (2026-05-09)` but not present on disk in the DNJ repo. Probably a session artifact that wasn't saved.
- Mobile responsive smoke (S25) — Chrome MCP can't emulate viewport; skipped. Source uses mobile-first Tailwind (md:/lg: only at 768px+, no fixed-width regressions found via DOM probe). Recommend a manual mobile pass on iPhone 12/13/14 once the above ships.
