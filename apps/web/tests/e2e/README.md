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

## What's covered

- Landing hero + nav rendering
- Signup form validation (disabled until required consents checked)
- Login link routing
- Footer privacy/terms links
- 404 page for unknown routes

**Not yet covered** (future work): end-to-end match flow with a seeded
talent + HM + role — requires the `supabase/seed_demo.sql` fixture to be
loaded and specific auth users created.
