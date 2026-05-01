# Data Breach Response Procedure

**Controller**: CRM Solution (003808986-A)
**DPO**: dpo@diamondandjeweler.com
**Last updated**: 2026-05-01
**Version**: 1.0

> Operational runbook for personal data breaches. Per Personal Data Protection Act 2010 (Malaysia) and Personal Data Protection (Compliance) Regulations 2013.
>
> A "personal data breach" means any unauthorised access, disclosure, alteration, loss, or destruction of personal data we control.

---

## Hour 0 — Detection

### Detection sources
- **Sentry / Vercel error logs** — production error spikes
- **Supabase Auth logs** — unusual login patterns, brute-force, mass signups
- **Cloudflare WAF / Turnstile** — bot or abuse alerts
- **Resend dashboard** — bounce / abuse complaint surge
- **User reports** — emails to dpo@diamondandjeweler.com or privacy@diamondandjeweler.com
- **Admin observation** — anomaly during admin panel use
- **Third-party notification** — Supabase / Resend / Cloudflare proactively informing us

### Immediate actions (within 15 minutes of detection)
1. Open `/admin` panel; identify scope (which user_ids, which tables, which time window).
2. **Freeze** affected accounts: `update profiles set is_banned = true where id in (...)`.
3. Begin an incident document: `docs/incidents/YYYY-MM-DD-{slug}.md` (template at the end of this file).
4. Preserve logs: snapshot Supabase logs, Vercel logs, Cloudflare logs into the incident doc.

---

## Hour 0–24 — Assessment

### Severity classification

| Level | Definition | Notification path |
|---|---|---|
| **Severe** | Any incident affecting **≥1 user's sensitive personal data** (DOB, IC, photos, encrypted columns) OR ≥10 users' identity data | Full path below |
| **Material** | Incident affecting non-sensitive data, ≥10 users | JPDP notification + internal log; user notification at admin's discretion |
| **Minor** | Single-user, non-sensitive, no data exposed externally | Internal log only |

### Decisions to log in the incident doc
- Severity level + reasoning
- Number of affected users (count)
- Categories of data exposed
- Whether data was actually exfiltrated, or merely accessible
- Root cause hypothesis
- Containment status (frozen accounts, patched code, rotated keys)

### Containment
- If credential exposure: rotate keys (Supabase service-role, Resend API key, Cloudflare Turnstile secret).
- If code vulnerability: patch + deploy + verify fix in production.
- If data still exposed via storage / public URL: revoke signed URLs, rotate bucket if necessary.

---

## Hour 24–72 — JPDP notification (if severe)

### Submission
1. Go to https://www.pdp.gov.my (Jabatan Perlindungan Data Peribadi) — Complaint / Notification form.
2. Notification must include:
   - Nature of the breach (categories of data, approximate count of subjects + records)
   - Date and time of detection + when breach occurred
   - Likely consequences
   - Measures taken to contain
   - DPO contact details
3. Save the JPDP confirmation receipt in the incident doc.

### Template language for JPDP notification
> *"On {YYYY-MM-DD HH:MM} {timezone} we detected a breach affecting approximately {N} users of our recruitment platform diamondandjeweler.com. The categories of personal data potentially exposed are: {list}. The estimated cause is: {root cause}. Containment was achieved at {time}. Affected users will be notified within 7 days of detection. Our DPO ({dpo email}) is available for follow-up questions."*

---

## Hour 24 onwards — User notification (if severe)

### Within 7 days of detection
1. Identify affected users (`select email from profiles where id in (...)`).
2. Compose user-facing email — must include:
   - Plain-language description of what happened
   - Categories of their data that were exposed
   - Specific actions they should take (rotate password, watch for phishing, etc.)
   - DPO contact for questions
   - Link to incident summary on diamondandjeweler.com (optional but recommended)
3. Send via existing `notify` Edge Function with new template `breach_notification_{locale}`.
4. Log every send attempt in the incident doc.

### Template draft (EN, adapt per incident)
```
Subject: [Important] Security incident affecting your DNJ account — action recommended

Hi {first_name},

On {date} we detected a security incident on the DNJ recruitment platform.
Some of your personal data may have been exposed:

  • {categories}

What we have done:
  • {containment actions}
  • Notified the Malaysian PDPD on {jpdp date}

What we recommend you do:
  • {specific actions: rotate password, etc.}

Your account is safe to continue using. Full details:
{link or contact dpo@diamondandjeweler.com}

We're sorry for the disruption. If you have questions reply to this email or
write to dpo@diamondandjeweler.com.

— DNJ
```

---

## Within 30 days — Post-incident review

1. Root-cause analysis added to incident doc.
2. Remediation steps with owner + due date.
3. Update RoPA if data flow changes.
4. Update breach log table (`public.data_retention_log` or new `breach_log`).
5. Brief team (operators + dev) on lessons learned.

---

## Records retention

- Incident docs: **kept 2 years minimum** in `docs/incidents/`
- All emails to JPDP and affected users: **archived in DPO mailbox** at least 2 years
- Logs from incident time window: **frozen** (do not auto-purge) until incident closed

---

## Decision authority

| Decision | Who |
|---|---|
| Detect / classify severity | DPO + Admin |
| Freeze accounts / rotate keys | Admin |
| Submit JPDP notification | DPO (with admin co-sign) |
| Send user notification | DPO (with admin co-sign) |
| Public statement (press, social) | CRM Solution director only |

If DPO is unavailable, **diamondandjeweler@gmail.com** is the always-on backup mailbox.

---

## Incident doc template

```markdown
# Incident YYYY-MM-DD: <short slug>

**Detected at**: YYYY-MM-DD HH:MM UTC
**Detected by**: <name / system>
**Severity**: severe | material | minor
**Status**: open | contained | closed

## Scope
- Affected users: <count + how identified>
- Data categories exposed: <list>
- Time window of exposure: <from–to>

## Timeline
- HH:MM — detection
- HH:MM — containment action 1
- HH:MM — JPDP notified
- HH:MM — user notification sent
- ...

## Root cause
<hypothesis → confirmed cause>

## Containment
<actions taken>

## User notification
<draft + sent confirmation>

## JPDP notification
<receipt + reference number>

## Remediation
- [ ] <action> — owner — due
- [ ] <action> — owner — due

## Lessons learned
<process / code / monitoring changes>
```
