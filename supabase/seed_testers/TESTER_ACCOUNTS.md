# DNJ Tester Accounts — Live Database (sfnrpbsdscikpmbhrzub)

**Seeded:** 2026-05-09
**Site:** https://diamondandjeweler.com
**Password (all 30 accounts):** `TestDNJ#2026`

> All test emails end in `@dnj-test.my` so they're easy to spot and flush.
> Re-runnable seed: [seed_dnj_testers.sql](seed_dnj_testers.sql)

---

## Login URLs

| Surface | URL |
| --- | --- |
| Talent / HM login | https://diamondandjeweler.com/login |
| Admin console | https://diamondandjeweler.com/admin |
| Supabase dashboard | https://supabase.com/dashboard/project/sfnrpbsdscikpmbhrzub |

Captcha (Cloudflare Turnstile) is on the login form, so logins must go through the browser. Server-side curl/REST password-grant calls return `captcha_failed` — that's expected.

---

## 1 Admin (A01)

| ID | Email | Password | Role |
| --- | --- | --- | --- |
| A01 | `a01.admin@dnj-test.my` | `TestDNJ#2026` | admin |

Use for: moderation queue, force-match, refund flows, PDPA DSR review, currency reconciliation, kill-switch tests.

---

## 9 Hiring Managers (H02–H10)

> H01 is the pre-existing `demo.hm@techco.my` and remains untouched.

Each HM owns one verified company + one approved active role posting at `salary_offer_min..salary_offer_max`. All companies pre-verified.

| ID | Email | Password | Name | Industry | Company | Role posted | Salary (RM) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H02 | `h02.andrew.finance@dnj-test.my` | `TestDNJ#2026` | Andrew Lee | Finance / Banking | Pinnacle Capital Sdn Bhd | Risk Manager | 12 000 – 16 000 |
| H03 | `h03.anita.retail@dnj-test.my` | `TestDNJ#2026` | Anita Selvaraj | Retail / E-commerce | LumiRetail Sdn Bhd | Operations Lead, Omnichannel | 7 000 – 10 000 |
| H04 | `h04.khairul.fnb@dnj-test.my` | `TestDNJ#2026` | Khairul Anwar | F&B / Restaurant | Saji Selera Group Sdn Bhd | Restaurant Manager | 5 500 – 7 500 |
| H05 | `h05.meiling.health@dnj-test.my` | `TestDNJ#2026` | Tan Mei Ling | Healthcare / Medical | KlinikQ Holdings Sdn Bhd | Clinic Operations Lead | 7 000 – 9 500 |
| H06 | `h06.faridah.edtech@dnj-test.my` | `TestDNJ#2026` | Faridah Hashim | EdTech / Education | Lumio Learning Sdn Bhd | Curriculum Lead | 6 500 – 9 000 |
| H07 | `h07.vijay.logistics@dnj-test.my` | `TestDNJ#2026` | Vijay Raman | Logistics / Supply Chain | KargoLink Logistics Sdn Bhd | Warehouse Operations Manager | 7 500 – 10 500 |
| H08 | `h08.sofia.hospitality@dnj-test.my` | `TestDNJ#2026` | Sofia Abdullah | Hospitality / Hotel | Heritage Hotels Group Sdn Bhd | F&B Director | 8 500 – 12 000 |
| H09 | `h09.kwanghoe.construction@dnj-test.my` | `TestDNJ#2026` | Lee Kwang Hoe | Construction / Real Estate | Granitebuild Engineering Sdn Bhd | Project Manager (M&E) | 9 000 – 13 000 |
| H10 | `h10.chloe.design@dnj-test.my` | `TestDNJ#2026` | Chloe Ng | Design / Creative | Studio Lumens Creative Sdn Bhd | Senior UX Designer | 7 500 – 10 500 |

---

## 20 Talents (T01–T20) — one per industry

All talents: `onboarding_complete=true`, `consents.pdpa=true`, `consent_version=v2.1`, `is_open_to_offers=true`, `privacy_mode=public`. Profile expires 45 days from seed (resets on rerun).

| ID | Email | Password | Name | Industry | Postcode | Salary expected (RM) |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | `t01.aiman.tech@dnj-test.my` | `TestDNJ#2026` | Aiman Rashid | Tech / Software | KL 50450 | 9 000 – 13 000 |
| T02 | `t02.weiming.finance@dnj-test.my` | `TestDNJ#2026` | Tan Wei Ming | Finance / Banking | KL 50480 | 12 000 – 16 000 |
| T03 | `t03.priya.retail@dnj-test.my` | `TestDNJ#2026` | Priya Devi | Retail / E-commerce | PJ 47800 | 7 000 – 10 000 |
| T04 | `t04.hafiz.fnb@dnj-test.my` | `TestDNJ#2026` | Hafiz Bin Yusof | F&B / Restaurant | Penang 11900 | 5 500 – 7 500 |
| T05 | `t05.sueann.health@dnj-test.my` | `TestDNJ#2026` | Lim Sue Ann | Healthcare / Medical | KL 50100 | 7 000 – 9 500 |
| T06 | `t06.aisyah.edtech@dnj-test.my` | `TestDNJ#2026` | Nurul Aisyah | EdTech / Education | Cyberjaya 63000 | 6 500 – 9 000 |
| T07 | `t07.ravi.logistics@dnj-test.my` | `TestDNJ#2026` | Ravi Krishnan | Logistics / Supply Chain | Shah Alam 40000 | 7 500 – 10 500 |
| T08 | `t08.hidayah.hospitality@dnj-test.my` | `TestDNJ#2026` | Nurul Hidayah | Hospitality / Hotel | KL 50250 | 8 500 – 12 000 |
| T09 | `t09.kahleong.construction@dnj-test.my` | `TestDNJ#2026` | Choo Kah Leong | Construction / Real Estate | JB 80300 | 9 000 – 13 000 |
| T10 | `t10.sarah.design@dnj-test.my` | `TestDNJ#2026` | Sarah Chong | Design / Creative | KL 50450 | 7 500 – 10 500 |
| T11 | `t11.faisal.manufacturing@dnj-test.my` | `TestDNJ#2026` | Faisal Hakim | Manufacturing | Penang 11800 | 6 500 – 9 000 |
| T12 | `t12.joanna.marketing@dnj-test.my` | `TestDNJ#2026` | Joanna Yeoh | Marketing / Media | KL 50480 | 8 000 – 11 000 |
| T13 | `t13.dharmendra.legal@dnj-test.my` | `TestDNJ#2026` | Dharmendra Singh | Legal / Compliance | KL 50250 | 11 000 – 15 000 |
| T14 | `t14.suzanne.hr@dnj-test.my` | `TestDNJ#2026` | Suzanne Lim | HR / Recruitment | PJ 47810 | 7 500 – 10 500 |
| T15 | `t15.rohan.consulting@dnj-test.my` | `TestDNJ#2026` | Rohan Menon | Consulting / Advisory | KL 50100 | 12 000 – 17 000 |
| T16 | `t16.adlina.telecom@dnj-test.my` | `TestDNJ#2026` | Adlina Binti Ismail | Telecommunications | KL 50300 | 7 000 – 9 500 |
| T17 | `t17.razif.energy@dnj-test.my` | `TestDNJ#2026` | Razif Bin Hamid | Energy / Utilities | Bintulu 97000 | 8 500 – 11 500 |
| T18 | `t18.vinothini.pharma@dnj-test.my` | `TestDNJ#2026` | Vinothini Suppiah | Pharma / Biotech | PJ 46100 | 9 000 – 12 500 |
| T19 | `t19.kokwei.automotive@dnj-test.my` | `TestDNJ#2026` | Tan Kok Wei | Automotive | Subang 47500 | 7 000 – 9 500 |
| T20 | `t20.nurin.sales@dnj-test.my` | `TestDNJ#2026` | Nurin Iskandar | Sales / BD | KL 50470 | 6 500 – 9 500 |

---

## Pending support to run remaining scenarios

These external pieces are still required to unlock the deeper test scenarios:

1. **Billplz sandbox** — switch `BILLPLZ_BASE_URL` to `https://www.billplz-sandbox.com` and use sandbox keys when running purchase/refund tests. The live Billplz keys are currently set, so any purchase will try a real charge.
2. **Captcha bypass for QA** — Cloudflare Turnstile blocks server-driven login. Either provision a `BYPASS_CAPTCHA` flag for `@dnj-test.my` emails on the auth function, or run all login tests through a real browser.
3. **WhatsApp (WATI) sandbox** — confirm a tester WhatsApp number / sandbox sender is wired before running any opt-in flow.
4. **Resend webhook secret** — `RESEND_WEBHOOK_SECRET` is still unset; bounce notifications won't fire until it's added (see project memory `reference_supabase_bole.md` "Pending").
5. **Match-engine seeds** — talent profiles are bare; `interview_answers`, `parsed_resume`, `derived_tags`, and `interview_transcript` are NULL/sparse. To make matching produce realistic scores, run `chat-onboard` for each talent (or hand-craft a `parsed_resume` + `interview_answers` block via SQL).
6. **Auth-API admin features (force-match, password reset, refund)** — these need either the rotated `SUPABASE_SERVICE_ROLE_KEY` reapplied to the right Edge Functions, or an Edge Function wrapper since the service-role key was dropped from the frontend on 2026-04-21.

---

## Re-seed (idempotent)

```bash
# From repo root
psql "$DATABASE_URL" -f supabase/seed_testers/seed_dnj_testers.sql
# or via Management API:
curl -X POST https://api.supabase.com/v1/projects/sfnrpbsdscikpmbhrzub/database/query \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H 'Content-Type: application/json' \
  --data-binary @<(jq -Rs '{query: .}' supabase/seed_testers/seed_dnj_testers.sql)
```

The script wipes any prior `@dnj-test.my` rows first, so it's safe to run repeatedly.

---

## Cleanup before going public

Run this exact block before public launch (or whenever you want to wipe all 30 testers):

```sql
-- DNJ tester wipe — execute via Supabase SQL editor or Management API
BEGIN;
  DELETE FROM public.hiring_managers WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@dnj-test.my');
  DELETE FROM public.companies       WHERE primary_hr_email LIKE '%@dnj-test.my';
  DELETE FROM auth.users             WHERE email LIKE '%@dnj-test.my';
COMMIT;

-- Sanity check (should all be 0)
SELECT 'auth.users'      , COUNT(*) FROM auth.users      WHERE email LIKE '%@dnj-test.my'
UNION ALL SELECT 'profiles', COUNT(*) FROM public.profiles      WHERE email LIKE '%@dnj-test.my'
UNION ALL SELECT 'talents' , COUNT(*) FROM public.talents       WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@dnj-test.my')
UNION ALL SELECT 'hiring_managers', COUNT(*) FROM public.hiring_managers WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@dnj-test.my')
UNION ALL SELECT 'companies', COUNT(*) FROM public.companies WHERE primary_hr_email LIKE '%@dnj-test.my'
UNION ALL SELECT 'roles', COUNT(*) FROM public.roles WHERE hiring_manager_id IN (SELECT hm.id FROM public.hiring_managers hm JOIN public.profiles p ON p.id=hm.profile_id WHERE p.email LIKE '%@dnj-test.my');
```

The cascade chain handles `talents`, `roles`, `interviews`, `matches`, `extra_match_purchases`, `urgent_priority_requests`, etc. automatically once the auth user is gone.

---

## Coverage map (what each persona unblocks)

| Scenario type | Personas needed |
| --- | --- |
| Talent signup → onboarding → match | T01–T20 |
| HM post-role → curated matches → unlock contact | H01 + H02–H10 |
| Talent ↔ HM interview round / offer | T01 + H01 (Tech, mirrors prior smoke test) |
| Force-match / moderation / refund | A01 + any T + any H |
| PDPA DSR (export, delete, correct) | A01 + T05 (healthcare → PII-sensitive) |
| Currency-unit consistency (pts vs 💎) | H01–H10 dashboards (each shows 0 pts initially) |
| Industry coverage (signup empty-states) | T11 (manufacturing) + T13 (legal) + T17 (energy) — outside the live HM industry list, used to test "no roles available" empty-state |
| Multi-language onboarding | Switch profile.locale to `ms` or `zh` for T04, T11, T19 (Bahasa, Mandarin code paths) |

For the full 25-scenario E2E plan see the prior `04_test_plan.md` deliverable.
