# Rollback runbook — DNJ production

> Target time-to-rollback: **< 15 minutes** from incident detection to safe state.
>
> Two layers: **Vercel** (frontend code) and **Supabase** (database + edge functions + storage).
> Rollback strategy differs because Vercel deployments are immutable history;
> Supabase migrations are forward-only.

---

## 0. Incident classification (decide rollback type in <2 min)

| Symptom | Layer | Action |
|---|---|---|
| White screen / JS error / wrong route | Vercel | Promote previous deployment |
| 500 from edge function | Supabase Edge | Redeploy previous function version |
| Bad migration → broken queries | Supabase DB | Forward-fix or restore from PITR |
| Webhook handler dropping payments | Supabase Edge + DB | Pause cron, redeploy fn, replay missed webhooks |
| Auth failures across all users | Supabase Auth config | Revert auth provider changes |
| Stale assets cached at edge | Vercel | Re-deploy with cache-bust |

---

## 1. Vercel rollback (frontend)

DNJ does **not** have Vercel git integration — every prod deploy is `vercel deploy --prod`.

### Option A — promote previous deployment (fastest, ~1 min)
```bash
cd apps/web
vercel ls --prod                  # list recent prod deployments
vercel promote <deployment-url>   # promote a prior good deployment to prod
```

### Option B — git revert + redeploy (when bad commit is identified)
```bash
git revert <bad-sha>
git push origin main
cd apps/web
vercel deploy --prod              # full redeploy
```

### Option C — stash hotfix
If commit graph is messy:
```bash
git checkout -b hotfix/rollback <last-known-good-sha>
cd apps/web
vercel deploy --prod
# later: cherry-pick fixes back into main
```

**Verify:** `curl -I https://diamondandjeweler.com/` shows `200`, version meta tag matches expected.

---

## 2. Supabase Edge Function rollback

Supabase doesn't keep a built-in version history of deployed functions. **You** must keep the old version.

### Pre-incident hygiene (recommended)
- Tag every prod release in git: `git tag prod/2026-05-07-001 && git push --tags`
- Before any function deploy: `git log --oneline supabase/functions/<fn>/index.ts` to know previous SHA

### Rollback steps
```bash
# 1. Check out the previous working version
git checkout <last-known-good-sha> -- supabase/functions/<fn>/

# 2. Redeploy
supabase functions deploy <fn> --project-ref sfnrpbsdscikpmbhrzub

# 3. Verify with a smoke call (e.g. for payment-webhook):
curl -I https://sfnrpbsdscikpmbhrzub.supabase.co/functions/v1/<fn>
```

**Verify:** check Supabase logs (Dashboard → Edge Functions → Logs) for healthy responses for 5 minutes after rollback.

---

## 3. Supabase database rollback

Migrations are forward-only. Two strategies:

### A. Forward-fix (preferred — most non-destructive cases)
Write a new migration `00XX_revert_<thing>.sql` that undoes the bad migration's effect:

```sql
-- 0085_revert_0084_enqueue_active_roles.sql
ALTER TABLE public.match_queue DROP COLUMN IF EXISTS bad_field;
DROP FUNCTION IF EXISTS public.broken_fn();
-- restore previous version of function:
CREATE OR REPLACE FUNCTION public.previously_working_fn(...) ...
```
Apply via:
```bash
supabase db push --project-ref sfnrpbsdscikpmbhrzub
```

### B. Point-in-time recovery (PITR — when forward-fix is infeasible)
**Supabase Pro plan** retains 7 days of WAL. Steps:

1. **STOP all writes** that depend on the bad state. Pause cron jobs:
   ```sql
   update cron.job set active = false where jobname like 'bole-%';
   ```
2. **Open Supabase Dashboard → Database → Backups → Point in Time Recovery**.
3. Pick a timestamp **before** the bad migration ran.
4. Confirm. **THIS RESTORES THE ENTIRE PROJECT** — every write since then is lost. There is no per-table PITR on Supabase.
5. After restore, re-run any benign migrations that were lost.
6. Re-enable cron:
   ```sql
   update cron.job set active = true where jobname like 'bole-%';
   ```

**WARNING:** PITR loses every legitimate write since the chosen timestamp. Use only when forward-fix is impossible.

### C. Manual table restore from logical backup
If you have a recent `pg_dump` (Phase A), you can restore individual tables:

```bash
# Take a fresh dump of the whole DB first (so you can compare)
supabase db dump -f backup_pre_restore.sql --project-ref sfnrpbsdscikpmbhrzub

# Restore one table from a prior dump
psql "<UAT-or-prod-connection-string>" -c "DROP TABLE public.bad_table CASCADE;"
psql "<connection-string>" -f older_dump.sql -t public.bad_table
```

---

## 4. Storage rollback

Supabase Storage does not version objects. If a bad bucket policy is deployed:

1. Revert the SQL policy:
   ```sql
   DROP POLICY "bad_policy" ON storage.objects;
   CREATE POLICY "good_policy" ON storage.objects ... -- previous version
   ```
2. If files were deleted by mistake, **the only recovery is uploading from a backup**. Maintain a weekly off-Supabase backup of the `talent-resumes` and `company-logos` buckets — see Phase 12 of the launch plan.

---

## 5. Auth provider rollback

Reverting OAuth provider changes (Google, magic link, etc.):

1. Supabase Dashboard → Authentication → Providers
2. Revert any client_id / client_secret changes
3. Revert SAML / SSO configuration if applicable
4. Test sign-in with one talent + one HM account to confirm

If a redirect URL was misconfigured causing all logins to fail:

```bash
# Revert via CLI
supabase auth update --site-url https://diamondandjeweler.com \
  --additional-redirect-urls 'https://diamondandjeweler.com/auth/callback'
```

---

## 6. Data-fix runbook (e.g. webhook lost a payment)

If `payment-webhook` was down/buggy and Billplz callbacks were dropped:

1. Get the Billplz dashboard list of paid bills since the incident window.
2. For each, query: `SELECT id, payment_status FROM point_purchases WHERE payment_intent_id = '<bill-id>';`
3. If `payment_status='pending'`, call the webhook manually:
   ```bash
   # Ask Billplz to re-fire the callback (Billplz dashboard → Bills → Re-trigger callback)
   # OR: insert directly via service role key (last resort)
   ```
4. Verify points / extra_match credited.

---

## 7. Communications

If user-facing impact > 5 min:

1. Update status in `system_config.banner_message`:
   ```sql
   update public.system_config
   set value = '"We are investigating an issue affecting login. ETA 15 min."'::jsonb
   where key = 'banner_message';
   ```
   The frontend reads this and shows a top banner.
2. After resolution, clear:
   ```sql
   update public.system_config set value = '""'::jsonb where key = 'banner_message';
   ```
3. If payment-affecting: email impacted users with apology + next-step note (use Resend dashboard with a saved template).

---

## 8. Drill schedule

Run a rollback drill **once per quarter**:
- Spin up a UAT branch
- Deploy a deliberately-broken function
- Practice forward-fix + redeploy
- Time the cycle. Should be under 15 min.

Record results in `docs/drills/<YYYY-MM-DD>_rollback.md`.

---

## 9. Pre-flight checklist (do before every prod deploy)

- [ ] `git tag prod/$(date +%Y-%m-%d-%H%M)` and push
- [ ] Note the latest "known good" Vercel deployment URL
- [ ] If migration in deploy: have a rehearsed forward-fix migration ready
- [ ] Have Billplz dashboard open in case webhook reconciliation needed
- [ ] Sentry open for error stream
- [ ] Customer support reachable (so they can field reports during deploy window)
