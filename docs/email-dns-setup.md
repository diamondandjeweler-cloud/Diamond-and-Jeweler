# Email DNS Setup — SPF / DKIM / DMARC

Sending domain: `diamondandjeweler.com`  
Email provider: [Resend](https://resend.com) — all records are found in **Resend Dashboard → Domains**.

---

## Step 1 — Add the domain in Resend

1. Go to **Resend → Domains → Add Domain**.
2. Enter `diamondandjeweler.com`.
3. Resend will display the DNS records to add (Steps 2–4 below).

---

## Step 2 — SPF record

| Type | Host       | Value                                      |
|------|------------|--------------------------------------------|
| TXT  | `@`        | `v=spf1 include:_spf.resend.com ~all`      |

If a TXT record for `@` already exists (e.g. Google Workspace), merge the `include` clause:
`v=spf1 include:_spf.google.com include:_spf.resend.com ~all`

---

## Step 3 — DKIM record

Resend generates a unique DKIM key per domain. The record looks like:

| Type  | Host                                      | Value                               |
|-------|-------------------------------------------|-------------------------------------|
| TXT   | `resend._domainkey.diamondandjeweler.com` | `v=DKIM1; k=rsa; p=<long public key>` |

The exact `p=` value is shown in the Resend Dashboard after adding your domain.

---

## Step 4 — DMARC record

| Type | Host               | Value                                                           |
|------|--------------------|-----------------------------------------------------------------|
| TXT  | `_dmarc`           | `v=DMARC1; p=quarantine; rua=mailto:dmarc@diamondandjeweler.com; pct=100` |

Start with `p=none` while monitoring, escalate to `p=quarantine` once SPF + DKIM pass consistently.

---

## Step 5 — Return-Path / Custom Bounce Domain (optional but recommended)

| Type  | Host              | Value                      |
|-------|-------------------|----------------------------|
| CNAME | `bounce`          | `feedback-smtp.us-east-1.amazonses.com` *(or Resend-provided)* |

Check the Resend Dashboard for the exact CNAME target.

---

## Step 6 — Verify in Resend

After adding all records, click **Verify** in Resend. DNS propagation can take up to 48 hours but usually completes within 15–30 minutes.

---

## Step 7 — Update `RESEND_FROM` environment variable

Once the domain is verified in Resend, update the env var in Supabase Edge Functions:

```
RESEND_FROM=noreply@diamondandjeweler.com
```

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, update `RESEND_FROM`.

Also update the same in Vercel: Dashboard → Project → Settings → Environment Variables.

---

## Verification checklist

- [ ] SPF TXT record added to DNS
- [ ] DKIM TXT record added to DNS
- [ ] DMARC TXT record added to DNS
- [ ] Resend Dashboard shows domain as "Verified"
- [ ] `RESEND_FROM` updated to `noreply@diamondandjeweler.com` in Supabase and Vercel
- [ ] Send a test email via Resend Dashboard and verify delivery + DKIM/DMARC pass in Gmail "Show Original"
