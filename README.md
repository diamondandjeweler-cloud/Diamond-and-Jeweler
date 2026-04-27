# BoLe Platform

Dual-sided recruitment platform. Talents and hiring managers each receive
exactly three curated matches at a time; a hidden matching engine blends
behavioural tags (70%) with proprietary life-chart data (30%).

- **Stack:** React (Vite) + Supabase (Postgres / Auth / Storage / Edge Functions) + Vercel + Resend
- **Domain:** diamondandjeweler.com (Malaysia-first)
- **Launch plan:** Option C — 28 day public launch. Pilot behind waitlist first.

---

## Milestone 1 — Database scaffold (THIS MILESTONE)

Everything in `supabase/` is the database foundation. Nothing runs yet — this
milestone only makes the schema real so subsequent milestones can build on it.

### What you get

- 22 tables with correct FKs, indexes, `updated_at` triggers
- `public.is_admin()` helper, granted to `authenticated`
- Real DOB encryption via **pgsodium** + named key `bole_dob_key`
- `encrypt_dob(text)` / `decrypt_dob(bytea)` functions — decrypt gated to admin + service_role
- Row Level Security on every table with per-role policies
- Three private storage buckets with path-based RLS: `ic-documents`, `resumes`, `business-licenses`
- Auto-profile trigger on `auth.users` insert
- PDPA-ready tables: `data_requests` (DSR), `waitlist`, `admin_actions`
- `pg_cron` schedules for match expiry (6h) and data retention (daily 02:00 MYT)

### How to apply

1. **Create a new Supabase project**
   - Region: **Southeast Asia (Singapore)** — closest to Malaysia
   - Database password: record it in your secret manager
   - Project name suggestion: `bole-production` (or `bole-staging` for the first run)

2. **Run the migrations** in the SQL editor, in order:

   ```
   supabase/migrations/0001_schema.sql
   supabase/migrations/0002_helpers.sql   -- creates is_admin + pgsodium key
   supabase/migrations/0003_rls.sql       -- enables RLS + policies
   supabase/migrations/0004_storage.sql   -- creates buckets + storage policies
   supabase/migrations/0005_cron.sql      -- pg_cron + pg_net schedules
   ```

   Each file is idempotent-friendly. Run them as owner (the default in the
   Supabase SQL editor).

3. **Load seed data**

   ```
   supabase/seed.sql
   ```

4. **Set Vault secrets** (required before `pg_cron` can call Edge Functions — Edge Functions arrive in Milestone 3; this step can be done any time before that):

   In the SQL editor, run with your real values:

   ```sql
   select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'supabase_url');
   select vault.create_secret('YOUR-SERVICE-ROLE-KEY',            'service_role_key');
   ```

   Service role key is at **Settings → API → service_role secret**. Never commit it.

5. **Seed the admin user**
   - In Authentication → Users → **Add user**, invite `diamondandjeweler@gmail.com`
   - Check the inbox, set a password
   - Back in SQL editor, run:

     ```sql
     update public.profiles
     set role = 'admin', onboarding_complete = true
     where email = 'diamondandjeweler@gmail.com';
     ```

6. **Verify**
   - Log in at **Authentication → Users** as the admin
   - In SQL editor, run `select public.is_admin();` → should return `true`
   - `select public.encrypt_dob('1990-05-15');` → returns a bytea
   - `select public.decrypt_dob(public.encrypt_dob('1990-05-15'));` → returns `1990-05-15`
   - `select count(*) from public.tag_dictionary;` → 20

### What does NOT work yet

- No frontend (Milestone 2)
- No Edge Functions (Milestone 3)
- No onboarding UI (Milestone 2)
- No email delivery (Milestone 3)
- Storage buckets exist but nothing uploads to them yet (Milestone 2)

---

## Milestone 2 — React frontend (DONE)

The Vite + React + Tailwind app lives in `apps/web/`.

### Run locally

```bash
cd "apps/web"
cp .env.example .env.local
# Edit .env.local with the values from your Supabase project:
#   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
#   VITE_SUPABASE_ANON_KEY=eyJ...
#   VITE_SITE_URL=http://localhost:3000
npm install
npm run dev
```

Open http://localhost:3000. You'll see the landing page. Sign-up flow works
against your Supabase project (Milestone 1 must be applied).

### What's in M2

- **Auth**: signup (role picker: talent / HR), login, password reset, email-confirmation callback, PKCE flow
- **Session**: `useSession` zustand store with real `onAuthStateChange` listener — no race conditions
- **Role routing**: `/home` redirects based on `profile.role` + `onboarding_complete`
- **Waitlist**: public form on landing page, writes to `public.waitlist`
- **Talent onboarding**: IC + résumé upload (signed URLs, path-scoped by `auth.uid`), DOB via `encrypt_dob()` RPC, 20 interview questions, 20 preference ratings, salary range, keyword-derived tags
- **HM onboarding**: 10 leadership-style questions with per-option tag weights, encrypted DOB
- **HR onboarding**: Company registration with business-license upload, auto-linked to HR email
- **Dashboards**: Talent, HM, HR, Admin — wired to Supabase (placeholder wiring until Milestone 3's Edge Functions generate real matches)
- **Admin backoffice (first cut)**: verification queue with license preview, waitlist approval, tag dictionary CRUD
- **Production polish**: ErrorBoundary, LoadingSpinner, SPA routing via `vercel.json`, security headers (CSP, HSTS, X-Frame-Options), PKCE auth flow

## Folder layout

```
Diamond and Jeweler/
├── README.md
├── .env.example (root, for functions)
├── .gitignore
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   └── migrations/            (0001–0005)
├── apps/
│   └── web/                   (Vite + React + Tailwind)
│       ├── .env.example
│       ├── index.html
│       ├── package.json
│       ├── tailwind.config.js
│       ├── vercel.json
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           ├── index.css
│           ├── components/    (Layout, ProtectedRoute, OnboardingGate, ErrorBoundary, LoadingSpinner, Consent)
│           ├── lib/           (supabase, storage, api)
│           ├── state/         (useSession)
│           ├── types/         (db.ts)
│           ├── routes/
│           │   ├── Landing.tsx  WaitlistConfirm.tsx
│           │   ├── auth/      (SignUp, Login, PasswordReset, AuthCallback)
│           │   ├── onboarding/(TalentOnboarding, HMOnboarding, CompanyRegister)
│           │   └── dashboard/ (TalentDashboard, HMDashboard, HRDashboard, AdminDashboard)
│           └── data/          (interview-questions, preference-aspects, leadership-questions)
└── docs/                       (legal copy + PDPA notices arrive in Milestone 4)
```

## Milestone 3 — Edge Functions (DONE)

Five Edge Functions + two HM-facing UI screens glue everything together.

### Functions

| Function | Triggered by | Auth | Purpose |
|---|---|---|---|
| `match-generate` | HM posts a role; `match-expire`; admin tooling | HM (ownership) / admin / service-role | Inserts up to 3 matches per role. Dedup, refresh-limit, life_chart=NULL. Cold-start fallback. |
| `match-expire` | `pg_cron` every 6 h | admin / service-role | Flips stale matches to `expired`, logs history, triggers regen per role (refresh-limit prevents infinite loops). |
| `notify` | other functions (service role) | admin / service-role | Resend + in-app. 6 templated email types. |
| `invite-hm` | HR admin UI | hr_admin (verified company) / admin | `inviteUserByEmail` magic-link, links HM row to caller's company. Idempotent. |
| `data-retention` | `pg_cron` daily 02:00 MYT | admin / service-role | Purges IC files 30 days after verify; applies DSR deletions 30 days after completion. |

All five functions do their own JWT + role validation via
`supabase/functions/_shared/auth.ts`. Outer `verify_jwt` is disabled so cron
jobs (service-role) can call them.

### Deploy

```bash
# From project root, after installing Supabase CLI:
supabase functions deploy match-generate
supabase functions deploy match-expire
supabase functions deploy notify
supabase functions deploy invite-hm
supabase functions deploy data-retention

# Set secrets so functions can reach Resend + Supabase:
supabase secrets set \
  SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  SUPABASE_ANON_KEY=eyJ... \
  SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  RESEND_API_KEY=re_... \
  RESEND_FROM="BoLe <noreply@resend.dev>" \
  SITE_URL=https://diamondandjeweler.com
```

### New frontend routes

- `/hm/post-role` — role posting form + market-rate warning; calls `match-generate` after insert
- `/hr/invite` — HR invites a hiring manager; calls `invite-hm`

Both wired into [App.tsx](apps/web/src/App.tsx).

Edge Functions live in `supabase/functions/`. See [supabase/config.toml](supabase/config.toml) for per-function JWT settings.

## Milestone 4 — Notifications, legal, DSR, deploy runbook (DONE)

### New user-facing surfaces

- **Notification bell** in the header ([NotificationBell.tsx](apps/web/src/components/NotificationBell.tsx)) — realtime Supabase channel subscription, unread badge, mark-all-read, dropdown list.
- **[/privacy](apps/web/src/routes/legal/PrivacyNotice.tsx)** — PDPA-aligned privacy notice draft (needs lawyer review; SSM entity name is a placeholder).
- **[/terms](apps/web/src/routes/legal/Terms.tsx)** — Terms of Service draft.
- **[/data-requests](apps/web/src/routes/DataRequests.tsx)** — user-facing DSR form (access, correction, portability, deletion) + history table.
- Legal links in Layout footer + Landing footer.

### Admin backoffice additions

- New **Data requests** tab on [/admin](apps/web/src/routes/dashboard/AdminDashboard.tsx) — pending filter, mark in-review / completed / rejected; the `data-retention` cron enforces deletion 30 days after completion.

### Docs

- **[docs/deploy.md](docs/deploy.md)** — end-to-end runbook for Days 25–28 (Supabase, Edge Functions, diamondandjeweler.com DNS, Vercel, Resend DNS, smoke test, legal gate, go-live).
- **[docs/legal-copy.md](docs/legal-copy.md)** — source of truth for all consent text; flags open questions for legal review.

---

## Local development

You can run the full stack on your laptop with zero cloud signup via
[docs/local-dev.md](docs/local-dev.md) — Docker + `supabase start` brings
up Postgres, Auth, Storage, and the Edge Function runtime. Use this to
verify everything before pointing at a real Supabase project.

## Quality-of-life additions (post-M4)

- **My roles** ([MyRoles.tsx](apps/web/src/routes/dashboard/MyRoles.tsx)) — HMs see all posted roles, per-role active-match count, pause/reopen/mark-filled. Re-opening triggers match-generate.
- **Profile editor** ([TalentProfile.tsx](apps/web/src/routes/dashboard/TalentProfile.tsx)) — talents update preferences, salary, open-to-offers, privacy mode without re-onboarding.
- **404 page** ([NotFound.tsx](apps/web/src/routes/NotFound.tsx)) — proper not-found instead of silent redirect.
- **Open Graph + favicon** — social-sharing meta tags + SVG mark in [index.html](apps/web/index.html).

## Admin tools (post-M4)

- **Cold-start queue UI** — roles flagged as having <3 eligible talents surface here; admin picks up to 3 candidates manually; matches inserted with `internal_reasoning.source = 'admin_cold_start'`.
- **User management** — list / search / filter (banned, ghosting ≥ 3) / ban-unban profiles.
- **Match management + algorithm audit** — search matches by status, inspect `internal_reasoning` JSON, force-expire.
- **System config editor** — edit every `system_config` row live (JSON textarea, validated on save).
- **Match expiry warnings** ([0006_match_expiry_warning.sql](supabase/migrations/0006_match_expiry_warning.sql) + [match-expire](supabase/functions/match-expire/index.ts)) — cron now fires `match_expiring` notifications 24 h before expiry to both talent and hiring manager. De-duped via `expiry_warning_sent_at` column + partial index.

All live in [AdminDashboard.tsx](apps/web/src/routes/dashboard/AdminDashboard.tsx) as tabs alongside the existing verification queue / waitlist / tag dictionary / data requests.

## Hiring-manager flow (post-M4)

- **Role editing** ([EditRole.tsx](apps/web/src/routes/dashboard/EditRole.tsx)) — ownership-gated. Edits apply immediately to existing matches.
- **"Mark hired / not hired"** on HR dashboard — closes the interview loop, transitions `matches.status` → `hired` or `interview_completed`.

## Local-dev demo data

- **[supabase/seed_demo.sql](supabase/seed_demo.sql)** — one-command fixture for local dev: 1 verified company (TechCo), 1 HM, 2 talents, 2 roles, 2 generated matches.

## Analytics, audit & ops (post-M4)

- **KPIs dashboard** ([KpiPanel.tsx](apps/web/src/routes/dashboard/admin/KpiPanel.tsx)) — live counts by match status, active talents / roles, verified / pending companies, banned / ghosting users. Derived rates: match expiry rate, ghosting rate, interview → hire rate, average time to first view.
- **Notification log** ([NotificationLogPanel.tsx](apps/web/src/routes/dashboard/admin/NotificationLogPanel.tsx)) — last 100 email + in-app notifications; channel filter; resend button re-fires the `notify` Edge Function with the original payload.
- **Market-rate editor** ([MarketRatePanel.tsx](apps/web/src/routes/dashboard/admin/MarketRatePanel.tsx)) — CRUD `market_rate_cache`. Feeds the market-rate warning during role posting.
- **Interview feedback** ([InterviewFeedback.tsx](apps/web/src/routes/InterviewFeedback.tsx)) — both sides rate 1–5 after `interview_completed`; writes to `interviews.feedback_talent` / `feedback_manager`. Links surface automatically on Talent + HM dashboards.

## Testing & quality

- **Vitest unit tests** — `npm test` (watch) or `npm run test:run` (CI).
- **Playwright e2e smoke** — [tests/e2e/smoke.spec.ts](apps/web/tests/e2e/smoke.spec.ts); runs against `npm run preview` in CI (no backend needed for covered paths).
- **GitHub Actions CI** — 3 jobs in [.github/workflows/ci.yml](.github/workflows/ci.yml): web (typecheck + lint + test + build), e2e (Playwright), migrations (SQL presence check).
- **Accessibility pass** — skip-link, landmark roles, focus-visible outline, aria-live loading, Escape-to-close dropdowns. See [docs/accessibility.md](docs/accessibility.md).

## Typed DB access

`./scripts/generate-types.sh` regenerates [apps/web/src/types/db.generated.ts](apps/web/src/types/db.generated.ts) from your live Supabase schema. npm scripts `types:gen:local` and `types:gen:remote` wrap the same call. The hand-written loose types in [types/db.ts](apps/web/src/types/db.ts) remain as a fallback until you run the generator.

## Admin refactor

[AdminDashboard.tsx](apps/web/src/routes/dashboard/AdminDashboard.tsx) is now a 50-line tab shell. Each of the 11 tab panels lives as its own file under [apps/web/src/routes/dashboard/admin/](apps/web/src/routes/dashboard/admin/) — VerificationQueue, WaitlistPanel, ColdStartPanel, UserPanel, MatchPanel, TagPanel, DsrPanel, SystemConfigPanel, KpiPanel, NotificationLogPanel, MarketRatePanel + shared TabButton.

## PDPA data export (access / portability)

- **[0007_dsr_exports.sql](supabase/migrations/0007_dsr_exports.sql)** — private `dsr-exports` bucket + path-scoped RLS.
- **[dsr-export Edge Function](supabase/functions/dsr-export/index.ts)** — compiles profile + talent/HM + matches + interviews + notifications + consents + waitlist into JSON, decrypts DOBs via `decrypt_dob()`, uploads, fires a `dsr_export_ready` notify with a 24h signed URL.
- Admin DSR panel automatically triggers the export when an access/portability request is marked `completed`.

## PDPA correction workflow

- **[0009_dsr_correction.sql](supabase/migrations/0009_dsr_correction.sql)** — `data_requests.correction_proposal` jsonb column.
- **User-side** ([DataRequests.tsx](apps/web/src/routes/DataRequests.tsx)): choosing `Correction` shows a dynamic form with add/remove rows (field dropdown + new value). Seven allow-listed fields: name, phone, salary range, open-to-offers, privacy mode, HM job title.
- **Admin-side** ([DsrPanel.tsx](apps/web/src/routes/dashboard/admin/DsrPanel.tsx)): each correction renders as a diff; one "Apply correction" click fires [dsr-apply-correction](supabase/functions/dsr-apply-correction/index.ts).
- **Edge Function** validates every field against its allow-list + typed coercion, applies updates in one round-trip per target row, logs to `admin_actions`, marks DSR `completed`. Rejected fields surface back to admin with reasons.

## Life-chart engine

- **[0008_life_chart_function.sql](supabase/migrations/0008_life_chart_function.sql)** — `public.compute_life_chart_score(dob1, dob2)` with `life_chart_cache` memoisation; body is a placeholder returning `NULL`, clearly marked for you to plug in. See [docs/life-chart-integration.md](docs/life-chart-integration.md).
- **[match-generate](supabase/functions/match-generate/index.ts)** — decrypts both DOBs server-side, calls the scorer, blends `tag × weight_tag + life × weight_life` using [system_config](supabase/seed.sql) (0.7 / 0.3 defaults). Falls back to tag-only when the scorer returns NULL; every regime choice is recorded in `internal_reasoning`.

## Accessibility automation

- **ESLint** — `eslint-plugin-jsx-a11y` (recommended) runs on every src file via `npm run lint` + CI.
- **Playwright + axe-core** — [tests/e2e/a11y.spec.ts](apps/web/tests/e2e/a11y.spec.ts) scans seven public routes against WCAG 2.1 AA. CI e2e job fails on any `critical` or `serious` violation.

## Realtime match updates

- **[TalentDashboard](apps/web/src/routes/dashboard/TalentDashboard.tsx)** subscribes to `postgres_changes` on `public.matches`; HM invites, HR scheduling, and interview completions reflect without a refresh.
- **[HMDashboard](apps/web/src/routes/dashboard/HMDashboard.tsx)** caches the HM's role IDs, subscribes to `public.matches`, and updates the candidate list the moment a talent accepts or declines.

## Developer tooling

- **Vitest** — [vitest.config.ts](apps/web/vitest.config.ts), jsdom env, jest-dom matchers. Tests for [preference-aspects](apps/web/src/data/preference-aspects.test.ts), [leadership-questions](apps/web/src/data/leadership-questions.test.ts), [Consent](apps/web/src/components/Consent.test.tsx). Run with `npm test`.
- **ESLint + Prettier** — [.eslintrc.cjs](apps/web/.eslintrc.cjs), [.prettierrc](apps/web/.prettierrc). Scripts: `npm run lint`, `npm run format`.
- **GitHub Actions CI** — [.github/workflows/ci.yml](.github/workflows/ci.yml) runs typecheck + lint + test + build on every push/PR, plus a SQL-migration sanity check.
- **Storybook 8** — [.storybook/](apps/web/.storybook/) + sample stories for [Consent](apps/web/src/components/Consent.stories.tsx) and [LoadingSpinner](apps/web/src/components/LoadingSpinner.stories.tsx). Run `npm run storybook` for a component workbench.
- **.editorconfig** at repo root for consistent whitespace across any editor.

## Launch gate summary

Everything a developer can build is now built. What blocks public launch:

1. **SSM entity name + number** — substitute into `/privacy` §0.
2. **Resend DNS verified** on `diamondandjeweler.com` (lead time: hours after `.my` DNS propagates).
3. **Lawyer review** of `/privacy` and `/terms`.
4. **5-user smoke test** per `docs/deploy.md` §7.
5. **Flip `system_config.launch_mode` to `"public"`.**

Pilot launch (behind waitlist, under NDA) can happen as soon as items 1–2 are done. Public launch needs 3–5.

---

## Roadmap (28-day plan)

| Milestone | Days  | Focus                                                   |
|-----------|-------|---------------------------------------------------------|
| 1         | 1–3   | Database, encryption, RLS, storage, cron (THIS STEP)    |
| 2         | 4–10  | React scaffold, auth + session, onboarding flows, storage uploads, waitlist page |
| 3         | 11–17 | Edge Functions (JWT-verified): match-generate, match-expire, notify, invite-hm, data-retention; HM invite flow; 3-card dashboards; HR scheduling |
| 4         | 18–24 | Admin backoffice, in-app notifications, privacy notice + ToS + DSR workflow, data retention cron, waiting-period UI, hardening |
| Deploy    | 25–28 | DNS (diamondandjeweler.com), Resend DKIM/SPF/DMARC, Vercel deploy, staging smoke test, pilot invite, public launch |

---

## Contacts

- **Data controller:** Malaysian SSM-registered entity (confirmed — number + legal name pending, required for privacy notice in Milestone 4)
- **Admin email:** diamondandjeweler@gmail.com
- **Infra regions:** Supabase Singapore, Vercel SIN1 edge
