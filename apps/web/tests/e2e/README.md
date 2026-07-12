# End-to-end tests

Playwright smoke tests for the BoLe web app. These exercise real browser
rendering against a running dev server and Supabase backend.

## Prerequisites

1. **Local Supabase running** — see [`docs/local-dev.md`](../../../../docs/local-dev.md).
   `supabase start` must be up so auth + DB respond.
2. **`.env.local` present** at `apps/web/.env.local` with VITE vars
   pointing at local Supabase.
3. **Playwright browsers installed**:
   ```bash
   cd apps/web
   npx playwright install chromium --with-deps
   ```

## Run

```bash
cd apps/web
npm run test:e2e            # spawns `npm run dev` automatically
```

Or, against a running app:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

Against staging/production:

```bash
PLAYWRIGHT_BASE_URL=https://staging.diamondandjeweler.com npm run test:e2e
```

## UI mode

```bash
npm run test:e2e -- --ui
```

## What's covered (default no-backend smoke)

- Landing hero + nav rendering
- Signup form validation (disabled until required consents checked)
- Login link routing
- Footer privacy/terms links
- 404 page for unknown routes

These run with `npm run test:e2e` and need **no backend** — Supabase calls are
mocked or never made. `match-flow.spec.ts` also lives in this directory but
`test.skip`s itself unless `HAS_SEEDED_BACKEND` is set, so the default run stays
green without a database.

## Seeded match flow (opt-in, backend required)

The end-to-end match flow (talent + HM + role seeded → the HM sees the curated
candidate) needs a live local Supabase with demo users + the
`supabase/seed_demo.sql` fixture loaded. That provisioning is automated by
`tests/e2e/global-setup.ts` and wired via a **separate** config
(`playwright.seeded.config.ts`) so the default suite above is untouched.

```bash
# 1. Boot local Supabase (also applies migrations)
supabase start           # from repo root
# 2. Run the seeded flow (global-setup creates demo users + loads seed_demo.sql)
cd apps/web
HAS_SEEDED_BACKEND=1 npm run test:e2e:seeded
```

`global-setup.ts` reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
`SUPABASE_DB_URL` from the environment, falling back to `supabase status -o env`
(and to the documented local defaults for the non-secret URLs). It requires
`psql` on `PATH`. Without `HAS_SEEDED_BACKEND` the setup is a hard no-op.

In CI this runs as the **non-required** `e2e-seeded` job (see
`.github/workflows/ci.yml`) — `continue-on-error: true`, so it cannot block prod
promotion while it stabilises.
