# Legal Copy — Source of Truth

Drafts for all user-facing legal text. **Must be reviewed by a Malaysian
privacy lawyer before public launch.** Keep this file as the authoritative
source — the React pages (`apps/web/src/routes/legal/*`) mirror it.

Version: 0.2 · Last updated: 2026-05-10 · Renamed BoLe → DNJ throughout (rebrand abandoned)

---

## Signup consents

**DOB consent (required):**
> I consent to DNJ using my date of birth for its compatibility matching
> algorithm. My DOB will be encrypted and never shared with employers or
> other users.

**Market-rate consent (optional):**
> I consent to anonymised comparison of my salary expectations against
> market data.

**Terms of Service & Privacy Notice (required):**
> I have read and agree to the Terms of Service and Privacy Notice.

---

## Hiring-manager DOB consent (during onboarding)

> I consent to DNJ using my date of birth for its compatibility matching
> algorithm. My DOB will be encrypted and never shown to candidates.

---

## Video recording consent (Phase 2 — deferred)

> You may answer interview questions by recording a video. Videos are
> stored securely and used only for matching. You can delete your video at
> any time. By recording, you consent to this use.

---

## Waiting-period talent message (<3 matches)

> Our engine is reviewing new roles every hour. You'll see up to 3 offers
> as soon as they're ready. Estimated wait during pilot: 14 days.

---

## Waiting-period HM message (<3 candidates)

> Our engine is curating matches. You'll see up to 3 candidates per role as
> they arrive.

---

## Open questions for legal review

1. Is our DOB-consent wording sufficient under PDPA section 7 (consent)
   when the data use is "compatibility matching"?
2. Do we need a separate consent for sending email transactional content
   via Resend (outside Malaysia)?
3. What's the minimum retention period for audit / anti-fraud data after a
   user requests deletion? (Currently 30 days; Malaysia's AML/CTF may
   require longer for financial records, though we don't touch those.)
4. Is the limitation-of-liability clause in `/terms` section 7 enforceable
   under Malaysian consumer-protection law?
5. Cross-border data transfer: Supabase hosts our primary DB in Singapore.
   Do we need an explicit transfer clause?
6. The "400,000+ placements" marketing claim is currently **removed** from
   the consent copy. If you want to reinstate it, you need substantiating
   records per Malaysia's Trade Descriptions Act.

---

## "Fight the Interview" disclosure (Phase 3)

When we launch the coaching concierge, users must consent to:

> A DNJ coach may contact you before your interview to help prepare. You
> can opt out at any time. Coaches are bound by the same privacy
> obligations as the platform.
