# Load testing — k6

> **DO NOT RUN THESE SCRIPTS AGAINST PRODUCTION.**
> These scripts are written for a separate **UAT Supabase project**.
> They expect the UAT URL + anon key to be passed via env vars and refuse
> to run against the prod Supabase project ID.

## Setup

```bash
choco install k6      # Windows
# or: brew install k6  (macOS)
# or: snap install k6  (Linux)

# Required env vars (UAT only)
export SUPABASE_URL="https://<UAT-PROJECT-ID>.supabase.co"
export SUPABASE_ANON_KEY="eyJ...UAT anon key..."
export TEST_USER_EMAIL="loadtest+talent01@example.com"
export TEST_USER_PASSWORD="LoadTest!2026"
```

## Scripts

| File | What it tests | Default ramp |
|---|---|---|
| `01_login.k6.js` | Sign-in via Supabase auth | 50 → 200 VU over 5 min |
| `02_match_search.k6.js` | `urgent-priority-search` + `get_match_candidates` RPC | 50 → 500 VU over 10 min |
| `03_chat_support.k6.js` | `chat-support` edge fn (rate-limited at 30/h/user) | 30 VU over 3 min |
| `04_apply_flow.k6.js` | Sign-in → fetch role → submit application | 50 → 300 VU over 10 min |

## Running

```bash
k6 run apps/web/tests/load/01_login.k6.js
k6 run apps/web/tests/load/02_match_search.k6.js --vus 100 --duration 5m
```

## Targets (from launch plan)

- p95 latency < 500ms (matching < 300ms isolated)
- error rate < 1% at 1,000 concurrent users
- Supabase CPU < 80% at peak
- Supabase pooled connections < 80% of cap

## Stop conditions

- Error rate > 1% for 30 consecutive seconds → abort + capture logs
- p95 > 2000ms for 60 seconds → abort
- Any 5xx from Supabase API → abort

## Project-id guard

Each script reads `SUPABASE_URL` and asserts it does NOT contain the
production project id. Set the prod project id via `PROD_PROJECT_ID` env var
on your shell to enable the guard.
