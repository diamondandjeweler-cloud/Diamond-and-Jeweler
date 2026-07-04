# DNJ / BoLe — Legal Review Packet (for Malaysian counsel)

> **Purpose:** a self-contained brief so a Malaysian lawyer can give a yes/no + redlines on the
> three items that gate our pilot launch. **This document is prepared by the engineering team and
> is NOT legal advice** — the "our reading" notes are lay assumptions for you to confirm or correct.
> _Prepared 2026-07-04._

## 0. Company context (30 seconds)

DNJ / "BoLe" (`diamondandjeweler.com`) is a **pre-launch, two-sided AI-curated recruitment
marketplace**, Malaysia-first. Talent create profiles + upload résumés; hiring managers post roles;
an AI engine returns a short list of high-signal candidates. Data resides in Supabase (Singapore).
We are PDPA-conscious (encrypted NRIC/DOB, data-subject request tooling). We have **0 real users
yet** — nothing below has harmed anyone; we want it right *before* the first signup. Three items
need your sign-off; **Item 1 is the one we most need your view on.**

---

## Item 1 — Matching partly uses date-of-birth, and we collect race + religion (HIGH PRIORITY)

**What the product does.** The matching score is influenced by a candidate's **date of birth**
(via an internal "compatibility" signal), and talent onboarding also collects **race** and
**religion**. A low internal score can materially reduce whether a candidate is surfaced to an
employer at all.

**Why we're asking.** We are concerned this raises two distinct issues under Malaysian law:
1. **Sensitive personal data (PDPA 2010, as amended 2024).** Religion is expressly "sensitive
   personal data"; race and DOB-derived inferences may attract heightened obligations. We want to
   confirm the lawful basis, the explicit-consent wording required, and retention limits.
2. **Employment discrimination / fairness.** Using DOB (a proxy correlating with age) and
   protected attributes (race, religion) to determine who an employer *sees* could expose us and
   our hiring customers to discrimination claims or regulatory attention.

**Our reading (please confirm or correct).** We believe we can lawfully proceed **only if**:
(a) there is explicit, separable, opt-in consent for each sensitive attribute; (b) the attribute
is never the *sole* determinant of exclusion and we can evidence that; (c) we disclose the use in
plain language; and (d) we can justify each attribute's relevance to the service.

**The specific questions for you.**
- Is collecting/processing **race, religion, and DOB** for a matching/ranking purpose lawful under
  the PDPA (incl. the 2024 amendments) with explicit consent — or is any of it impermissible
  regardless of consent?
- Does influencing candidate *visibility to employers* using these attributes create
  **discrimination** exposure for DNJ and/or the hiring companies under Malaysian law?
- If risky: is the safer path to (i) drop race/religion collection entirely, (ii) stop using DOB
  as a ranking input, or (iii) keep them behind a specific consent + disclosure regime you draft?

**Where it lives (for your engineers-liaison):** talent onboarding fields (race/religion/DOB);
the matching signal is server-side (`supabase/functions/_shared/match-core.ts`) and not shown to
users. We can remove or gate any of these quickly once you advise.

---

## Item 2 — Hiring-side consent contains a likely-unenforceable PDPA rights waiver

**Issue.** The hiring-side consent copy includes a **"Waiver of Claims"** paragraph asking hiring
users to waive PDPA rights.

**Our reading.** Statutory PDPA rights likely cannot be contracted away (Contracts Act 1950), and
the clause **contradicts our own Privacy Notice §10**. This is flagged in
`docs/PRELAUNCH_BLOCKED_ITEMS.md` (Critical-4).

**Proposed fix (for your confirmation).** Our ToS **§8** already provides a properly drafted
RM 5,000 liability cap with PDPA carve-outs. Simplest fix: **delete the entire "Waiver of Claims"
section** and rely on ToS §8 — *or* replace it with a PDPA-compliant alternative you draft.

**Location:** `apps/web/src/routes/legal/Consent.tsx` (hiring consent body) + the seeded consent
row in `supabase/migrations/` (the active version). One-line ask: *"delete the waiver paragraph or
give us compliant replacement wording."*

---

## Item 3 — Terms of Service missing a user-content licence

**Issue.** Our Terms do not grant DNJ a licence to **host, store, reproduce, and display
user-uploaded content** (résumés, profile data, interview answers) — which is the platform's core
function.

**Proposed clause (for your drafting, not for direct paste):**
> "By submitting Content (including résumés, profile data, and interview responses) you grant DNJ a
> worldwide, non-exclusive, royalty-free licence to host, store, reproduce, and display that Content
> solely for the purpose of operating the matching service and only for the duration described in
> our Privacy Notice."

**Location:** `apps/web/src/routes/legal/Terms.tsx`. Please confirm scope, duration, and
sub-licensing (we do not sub-license today).

---

## What we need back

A short memo (or inline redlines) answering, per item:

| # | Item | We need |
|---|------|---------|
| 1 | DOB / race / religion in matching | Lawful basis? Discrimination exposure? Keep-with-conditions vs drop? |
| 2 | Consent PDPA-waiver | Delete-and-rely-on-ToS-§8 confirmed, or replacement wording |
| 3 | ToS content licence | Approved clause wording |

Items 2 and 3 are small and well-scoped. **Item 1 is the launch gate** — we will not open to real
users until we have your read on it. Turnaround here directly sets our pilot date.
