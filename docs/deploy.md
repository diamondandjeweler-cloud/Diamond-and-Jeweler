# BoLe Deployment Runbook (Days 25–28)

Target: public launch on **https://diamondandjeweler.com**. This runbook turns the code
in this repo into a live, operating platform.

---

## Prerequisites — who does what

| Item | Who | Lead time |
|---|---|---|
| Supabase project (Singapore) | You | 5 min |
| All migrations pushed (`supabase db push`) + seed | You | 5 min |
| Admin user seeded, elevated | You | 2 min |
| All Edge Functions deployed + secrets | You | 20 min |
| SSM entity name + number | You → me | blocks privacy notice |
| Resend account + API key | You | 10 min + DNS lead |
| Vercel account | You | 5 min |
| diamondandjeweler.com domain registered | You | 24–72 h DNS |

You sign up for the external accounts; I've already produced all the code
and config they consume.

---

## 1. Supabase — one-time project setup

1. Create a new project at supabase.com (**region: Southeast Asia
   (Singapore)**).
2. Note the **project URL**, **anon key**, **service-role key**
   (Settings → API).
3. Apply **all** migrations under `supabase/migrations/` at once with the CLI
   (do not hand-run individual files — there are well over a hundred and the
   order is encoded in the filenames):
   ```bash
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```
4. Run `supabase/seed.sql` (SQL editor, or `psql` against the connection string).
5. Set Vault secrets for the cron jobs (required — without these every cron job
   is a silent no-op, see `supabase/migrations/0005_cron.sql`):
   ```sql
   select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'supabase_url');
   select vault.create_secret('YOUR-SERVICE-ROLE-KEY',            'service_role_key');
   ```
   Verify both secrets landed:
   ```sql
   select count(*) from vault.decrypted_secrets
   where name in ('supabase_url', 'service_role_key');  -- expect 2
   ```
6. Authentication → Users → invite `diamondandjeweler@gmail.com`, set password.
7. Back in SQL editor:
   ```sql
   update public.profiles set role = 'admin', onboarding_complete = true
   where email = 'diamondandjeweler@gmail.com';
   ```
8. Verify:
   ```sql
   select public.is_admin();                                -- → true (when you're that user)
   select public.decrypt_dob(public.encrypt_dob('1990-05-15'));  -- → 1990-05-15
   select count(*) from public.tag_dictionary;              -- → 20
   ```

---

## 2. Edge Functions

```bash
# Install CLI once
npm install -g supabase

# From project root
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# Deploy every function under supabase/functions/ (skip the _shared lib dir).
# This stays correct as functions are added — no hand-maintained list.
for d in supabase/functions/*/; do
  name=$(basename "$d")
  [ "$name" = "_shared" ] && continue
  supabase functions deploy "$name"
done

# Set secrets (matches supabase/functions/_shared/*)
supabase secrets set \
  SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  SUPABASE_ANON_KEY=eyJ... \
  SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  RESEND_API_KEY=re_... \
  RESEND_FROM="BoLe <noreply@resend.dev>" \
  SITE_URL=http://localhost:3000    # change to https://diamondandjeweler.com after DNS
```

---

## 2a. Post-deploy verification checklist

Run these immediately after migrations + functions are deployed:

```sql
-- Vault secrets present (else cron is a silent no-op):
select count(*) from vault.decrypted_secrets
where name in ('supabase_url', 'service_role_key');  -- expect 2

-- Cron schedules registered + active:
select jobname, schedule, active from cron.job;
-- expect (active = t): bole-match-expire-every-6h, bole-data-retention-daily

-- DOB encryption round-trips (pgcrypto + Vault):
select public.decrypt_dob(public.encrypt_dob('1990-05-15'));  -- → 1990-05-15
```

- [ ] `supabase db push` reported every migration applied (no pending diff).
- [ ] `supabase functions list` shows every directory under `supabase/functions/`
      (except `_shared`) as deployed.
- [ ] Vault secret count is **2** (query above).
- [ ] Both cron jobs are `active = t`.
- [ ] DOB encrypt/decrypt round-trip returns the original date.

---

## 3. Domain: diamondandjeweler.com

Register via a MYNIC-accredited registrar (Exabytes, Webnic, Shopper.my).
`.my` registration requires a Malaysian IC or SSM document scan — have it
ready. Per v4 PRD (Section 5), the canonical domain is **diamondandjeweler.com**.

After registration:

1. In the registrar control panel, change nameservers to Vercel's:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
2. Check propagation: `dig diamondandjeweler.com NS +short` should list Vercel (24–72 h).

---

## 4. Vercel

```bash
cd apps/web
npm install
npm install -g vercel
vercel link        # creates .vercel/ folder, asks to create a new project
```

In the Vercel dashboard for this project:

1. **Settings → Environment Variables** — add for Production:
   - `VITE_SUPABASE_URL` = `https://YOUR-PROJECT.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `eyJ…`
   - `VITE_SITE_URL` = `https://diamondandjeweler.com`
2. **Settings → Domains** — add `diamondandjeweler.com` and `www.diamondandjeweler.com` (Vercel issues
   SSL certs automatically once DNS points to it).
3. Deploy:
   ```bash
   vercel --prod
   ```

---

## 5. Resend

1. Create account at resend.com.
2. **Domains → Add domain** → `diamondandjeweler.com`. Copy the 3 records Resend gives you:
   - `TXT resend._domainkey.diamondandjeweler.com` → DKIM
   - `TXT diamondandjeweler.com` → SPF (`v=spf1 include:amazonses.com ~all`)
   - Optional `TXT _dmarc.diamondandjeweler.com` → DMARC policy
3. In Vercel DNS (Settings → Domains → diamondandjeweler.com → DNS Records), add those 3
   records. Wait for Resend to mark them verified.
4. **API Keys → Create API Key** (Full Access). Copy.
5. Update Supabase secrets to switch from the shared testing domain:
   ```bash
   supabase secrets set \
     RESEND_API_KEY=re_... \
     RESEND_FROM="BoLe <noreply@diamondandjeweler.com>" \
     SITE_URL=https://diamondandjeweler.com
   ```

---

## 6. Supabase auth — production URLs

Once the domain is live:

- **Authentication → URL Configuration**
  - Site URL: `https://diamondandjeweler.com`
  - Redirect URLs: add `https://diamondandjeweler.com/auth/callback`,
    `https://www.diamondandjeweler.com/auth/callback`
- **Authentication → Providers → Email**
  - Enable confirmations: **on**
  - Enable signup: **on** during pilot; switch to **invite-only** via
    `system_config.launch_mode` once public

---

## 7. Smoke test (5 seeded pilot users)

Run the full flow against production:

1. **Talent A** signs up at `https://diamondandjeweler.com/signup` → receives confirmation
   email → completes onboarding (IC, résumé, DOB, 20 Qs, 20 ratings, salary).
2. **HR** signs up → completes company registration → admin verifies in `/admin`
   (Verification queue).
3. **HR** invites **HM** via `/hr/invite` → HM gets a Supabase magic-link email →
   completes leadership profile.
4. **HM** posts a role via `/hm/post-role` → `match-generate` fires →
   Talent A sees a match.
5. **Talent A** accepts → **HM** invites → **HR** schedules → both sides get
   email + in-app notification.
6. **Admin** visits `/admin` → Data requests tab is empty.
7. **Talent A** submits a test 'access' DSR at `/data-requests` → appears in
   admin DSR queue.
8. **Admin** approves. (`data-retention` cron will enforce 30 d later.)

---

## 8. Legal — blocks public launch

- [ ] Malaysian lawyer reviews `/privacy`
- [ ] Malaysian lawyer reviews `/terms`
- [ ] SSM number + legal entity name substituted into privacy notice
- [ ] Retention / DSR response time signed off

---

## 9. Go-live

1. Flip `system_config.launch_mode` from `"pilot"` to `"public"`:
   ```sql
   update public.system_config set value = '"public"'::jsonb where key = 'launch_mode';
   ```
2. Announce (LinkedIn, HR networks, personal outreach).
3. Monitor:
   - Supabase → Database → Logs
   - Resend → Emails
   - Vercel → Deployments → Analytics
