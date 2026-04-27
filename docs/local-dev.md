# Local development

Run the entire BoLe stack on your laptop — Postgres, Auth, Storage, Edge
Functions, and the React app — without a cloud Supabase account. Useful when
you want to smoke-test migrations or new features before pointing at a real
project.

---

## Prerequisites

- **Docker Desktop** (required — `supabase start` spins up Postgres, GoTrue, Storage, etc. in containers)
- **Node.js 20+** and **npm**
- **Supabase CLI** v1.190+:
  ```bash
  npm install -g supabase
  ```

That's it. No Supabase cloud account, no Resend, no domain.

---

## 1. Boot local Supabase

From the repo root (`Diamond and Jeweler/`):

```bash
supabase init        # only the first time; will be a no-op if config.toml already exists
supabase start
```

This brings up:

| Service | Port |
|---|---|
| Postgres | 54322 |
| REST / PostgREST | 54321 |
| Studio (admin UI) | 54323 |
| Inbucket (catches local emails) | 54324 |
| Edge Functions runtime | served under `http://127.0.0.1:54321/functions/v1/` |

At the end of `supabase start` you'll see output like:

```
API URL: http://127.0.0.1:54321
anon key: eyJ...
service_role key: eyJ...
```

Copy these — you'll paste them into `.env.local` next.

## 2a. (Optional) Load demo fixtures

If you want populated data out of the box, run `supabase/seed_demo.sql` after
creating the five auth users it references (see the file's header comment).
Gives you: one verified company, one HM, two talents, two roles, two matches.

## 2. Apply migrations + seed

Migrations in `supabase/migrations/` auto-run as part of `supabase start`.
If you change a migration, reset:

```bash
supabase db reset     # DESTRUCTIVE — drops & recreates the local DB, re-runs migrations + seed
```

The reset also runs `supabase/seed.sql`.

Verify the schema loaded:

```bash
supabase db studio    # opens http://localhost:54323
```

In Studio, navigate **Tables** → you should see `profiles`, `talents`,
`roles`, `matches`, `hiring_managers`, `companies`, `tag_dictionary` (20
rows), `market_rate_cache` (~13 rows), etc.

## 3. Seed an admin user (manual, one-time)

Studio → **Authentication → Users → Invite user** → enter
`diamondandjeweler@gmail.com`. Local Auth fires an email into Inbucket
(http://localhost:54324) — click the magic link there to confirm.

Then in Studio's **SQL Editor**:

```sql
update public.profiles
set role = 'admin', onboarding_complete = true
where email = 'diamondandjeweler@gmail.com';
```

## 4. Run the React app against local Supabase

```bash
cd apps/web
cp .env.example .env.local
```

Edit `.env.local` with the values from step 1:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJ...           # from supabase start output
VITE_SITE_URL=http://localhost:3000
```

Then:

```bash
npm install
npm run dev          # → http://localhost:3000
```

Sign up a talent account at `/signup`. The confirmation email lands in
Inbucket (http://localhost:54324) — open it and click the confirmation
link. You'll land in `/auth/callback` and be routed to
`/onboarding/talent`.

## 5. Run Edge Functions locally

Edge Functions need their own env vars. Create
`supabase/functions/.env` (not checked into git):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJ...                # same as above
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # from supabase start output
RESEND_API_KEY=                         # leave empty locally — notify will skip sending
RESEND_FROM=noreply@resend.dev
SITE_URL=http://localhost:3000
```

Then, in a separate terminal:

```bash
supabase functions serve --env-file supabase/functions/.env
```

All five functions are now served at
`http://127.0.0.1:54321/functions/v1/<name>`. The React app already calls
them via `supabase.functions.invoke(...)` — no change needed.

## 6. Exercise the full flow locally

1. Sign up as **talent** → complete onboarding (use any fake IC image and
   PDF for uploads).
2. Log out, sign up as **HR** at `/signup` with `role=hr_admin`.
3. Register a company in `/onboarding/company`.
4. Log in as admin (`diamondandjeweler@gmail.com`), visit `/admin` →
   Verification queue → click **Verify**.
5. Log back in as HR → `/hr/invite` → invite a hiring manager with any
   email you can check (Inbucket will catch it if it's a made-up address
   at `@example.com`).
6. Click the magic link in Inbucket → HM lands on `/onboarding/hm` →
   complete leadership questions.
7. HM visits `/hm/post-role` → post a role → `match-generate` runs → you
   should see matches on the talent's dashboard.
8. Accept / invite / schedule through the flow end-to-end.

## 7. Shut down

```bash
supabase stop             # stops all containers, preserves data
supabase stop --no-backup # stops and drops data
```

---

## What *doesn't* work locally

- **`pg_cron` schedules don't tick**: you can still invoke the functions
  manually via `curl` or in Studio's SQL editor using `net.http_post`.
- **Resend email delivery** is skipped (API key is empty); the in-app
  notifications still appear in the bell.
- **diamondandjeweler.com domain / SSL** — obviously only the deployed version has this.
- **Auth Email templates** — local uses defaults; cloud lets you customise.

Everything else — RLS, pgsodium encryption, storage signed URLs, Edge
Function JWT verification, realtime notification bell — works end-to-end
against the local stack.

---

## Troubleshooting

- **`supabase start` hangs on pulling images** — make sure Docker Desktop
  has at least 4 GB RAM allocated (Settings → Resources).
- **`pgsodium` fails to create key** — local Supabase bundles pgsodium. If
  you see "extension not available", run `supabase stop --no-backup && supabase start`
  to reset the Postgres container.
- **`ERROR: function auth.uid() does not exist`** — you ran a migration
  outside `supabase db reset`. Fix: `supabase db reset`.
- **Vite can't reach `http://127.0.0.1:54321`** — some corporate proxies
  block loopback. Try `http://localhost:54321` in `.env.local` instead.
- **Email confirmation link returns 400** — check that
  `VITE_SITE_URL=http://localhost:3000` matches the `site_url` in
  `supabase/config.toml`.
