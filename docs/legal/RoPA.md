# Records of Processing Activities (RoPA)

**Controller**: CRM Solution (003808986-A) — operating DNJ Recruitment Platform
**DPO**: dpo@diamondandjeweler.com
**Privacy contact**: privacy@diamondandjeweler.com
**Last updated**: 2026-05-01
**Version**: 2.0

> Internal record per Personal Data Protection Act 2010 (Malaysia), s.41 read with the Personal Data Protection (Compliance) Regulations 2013. Kept on file; produced to JPDP on request. Customer-facing version is `/privacy`.

---

## 1. Categories of personal data processed

### 1.1 Account identity (required, all users)
- Full name
- Email address
- Phone number

### 1.2 Sensitive personal data (required for talents)
- Date of birth (DOB) — used by the proprietary matching algorithm; encrypted at column level (pgcrypto AES-256), never disclosed to employers or other users.

### 1.3 Sensitive personal data (voluntary — Identity-Verification Badge, future)
- NRIC / Passport number and copy
- Photograph

### 1.4 Professional data (talents)
- Résumé file
- Interview transcript (free-text answers)
- Workplace preference ratings (numeric)
- Salary expectations (numeric)
- Derived skill/preference tags

### 1.5 Company data (hiring managers / HR admins)
- SSM registration number
- Business license documents
- Role requirements posted

### 1.6 Technical data
- IP address, browser user agent, session tokens (Supabase Auth)
- Cloudflare Turnstile signals (for bot prevention only)
- Audit log entries for admin reads of sensitive fields

---

## 2. Categories of data subjects

| Category | Description |
|---|---|
| **Talents** | Job seekers in Malaysia, age ≥ 18 |
| **Hiring Managers** | Decision-makers at employer companies |
| **HR Admins** | Talent-acquisition staff at employer companies |
| **Platform Admins** | DNJ operators (CRM Solution staff) |

---

## 3. Purposes of processing

| Purpose | Legal basis |
|---|---|
| Account creation, authentication, and operation | Explicit consent at signup |
| AI-powered compatibility matching (uses DOB) | Explicit consent + necessary for service |
| Interview scheduling | Explicit consent |
| Anonymised market-rate salary comparisons | Explicit consent |
| Transactional email (signup verification, reset, match alerts) | Necessary for service |
| Optional WhatsApp notifications (when user opts in) | Explicit opt-in consent |
| Audit log for verification, dispute, compliance, security | Legitimate interest + legal obligation |

---

## 4. Recipients of personal data

### 4.1 Internal
- Platform admins under role-based access with audit logging.
- Hiring managers receive only **derived tags + preference ratings + salary expectation** of matched talents — never DOB, IC, full name, email (unless talent's profile is public).

### 4.2 Data processors (PDPA s.42 written contracts on file)

| Processor | Purpose | Region | DPA reference |
|---|---|---|---|
| **Supabase Inc.** | Database, auth, storage, edge compute infrastructure | Singapore (ap-southeast-1) | Supabase DPA, signed via dashboard |
| **Resend Inc.** | Transactional email delivery | US / EU | Resend DPA, signed via dashboard |
| **Cloudflare Inc.** | Turnstile (CAPTCHA), CDN | Global edge | Cloudflare DPA |
| **WATI** | WhatsApp business API (only for opted-in users) | Singapore / India | WATI DPA — pending sign on activation |
| **Vercel Inc.** | Frontend hosting | Global edge / sin1 | Vercel DPA, signed via dashboard |

### 4.3 Disclosure under legal compulsion
- Authorities under valid Malaysian court order or PDPA-compliant law-enforcement request.

---

## 5. Cross-border transfer (PDPA s.129)

- **Destination**: Singapore (Supabase data hosting)
- **Adequacy**: Singapore's Personal Data Protection Act 2012 provides protection substantially similar to Malaysian PDPA; recognised by JPDP.
- **Consent**: Captured at signup via the Consent dialog (`consent_versions.v2.0-*` rows).

---

## 6. Retention periods

| Data | Retention |
|---|---|
| Active account data | While account is open |
| NRIC / passport copy (if voluntary badge active) | 30 days after verification completes |
| Soft-deleted account | 30 days, then sensitive fields hard-purged |
| De-identified audit log entries | As required by law (no auto-purge) |
| Cron job: `dnj-soft-delete-purge-daily` | Runs 03:00 UTC daily, calls `public.purge_soft_deleted_after_30d()` |

---

## 7. Security measures

| Layer | Control | Implementation reference |
|---|---|---|
| Transport | TLS 1.2+ | Vercel-managed certificates, HSTS 2y+preload |
| At rest | AES-256 encryption | Supabase-managed (Postgres + S3) |
| Sensitive columns | pgcrypto AES-IETF | `encrypt_dob()` / `decrypt_dob()` SQL helpers |
| Access control | Row-Level Security on every public table | migrations 0003, 0014, 0015 |
| Bot prevention | Cloudflare Turnstile | CAPTCHA on signup + login |
| Auth | Min 10-char password, 3-class enforcement, email verification | Supabase Auth config |
| Admin access | Logged in `admin_actions` table | trigger on sensitive admin reads |
| Backup | Supabase PITR (Point-in-Time Recovery) — 7-day rolling | Supabase Pro plan |
| Network | Postgres not exposed publicly; access via Supavisor pooler with JWT | default Supabase config |
| Bot detection | Cloudflare WAF + Turnstile | front-of-edge |

---

## 8. Data subject rights — operational

- All requests submitted via `/data-requests` route
- Submission triggers Postgres trigger `tg_data_requests_notify_dpo` → emails DPO + BCC `diamondandjeweler@gmail.com`
- DSR types supported: `access`, `correction`, `deletion`, `portability`
- SLA: 21 days
- Export format: JSON bundle in `dsr-exports` storage bucket; signed URL emailed to user (24h expiry)
- Soft-delete on approval: `profiles.deleted_at = now()`; cron purges sensitive fields after 30 days

---

## 9. Breach response

See `docs/legal/breach-response.md` for the full procedure (72-hour JPDP notification, 7-day user notification, 2-year record retention).

---

## 10. Review schedule

- This RoPA is reviewed **at every privacy-notice version bump** (currently v2.0).
- Material changes to data processing → notify users by email + require re-consent.
- Annual review at minimum.
- Last reviewed: 2026-05-01 (post-lawyer review v2.0)
- Next review due: 2027-05-01
