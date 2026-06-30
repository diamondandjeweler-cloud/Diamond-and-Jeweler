#!/usr/bin/env bash
#
# deploy-backend.sh — one-shot backend deploy for the changes shipped this
# session (edge functions + migrations + post-deploy indexes). DNJ's frontend
# auto-deploys on push to main; the BACKEND deploys by hand — this script is that
# hand, in one place.
#
# PREREQUISITES (one-time):
#   - Supabase CLI installed:            npm i -g supabase   (or: brew install supabase/tap/supabase)
#   - A Supabase access token:           https://supabase.com/dashboard/account/tokens
#       export SUPABASE_ACCESS_TOKEN=sbp_xxx
#   - (For the post-deploy indexes step) the project's DB connection string:
#       export SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.sfnrpbsdscikpmbhrzub.supabase.co:5432/postgres"
#
# RUN:   bash scripts/deploy-backend.sh
#        bash scripts/deploy-backend.sh --functions-only      # skip migrations + indexes
#
# Order matters: migrations first (so new RPCs/tables exist), then functions,
# then the CONCURRENTLY indexes (which MUST run outside a transaction).

set -euo pipefail

PROJECT_REF="sfnrpbsdscikpmbhrzub"
HEALTH_URL="https://diamondandjeweler.com/api/health"
FUNCTIONS_ONLY="${1:-}"

cd "$(dirname "$0")/.."   # repo root

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: export SUPABASE_ACCESS_TOKEN first (https://supabase.com/dashboard/account/tokens)" >&2
  exit 1
fi

# Edge functions changed this session (directly, or via a changed _shared module:
# observe.ts / idempotency.ts / cors.ts / match-core.ts / match-scoring.ts).
FUNCTIONS=(
  payment-webhook resend-webhook process-match-queue match-generate match-expire
  admin-refund award-points buy-points redeem-points unlock-extra-match
  init-consult-booking notify send-push-notification
  dsr-export dsr-apply-correction data-retention
)

# ── 1. Migrations (skip with --functions-only) ───────────────────────────────
# 0163 pipeline_health failure-ratio · 0164 notification_outbox retention ·
# 0165 request_dedup. NOTE: prod tracking lags repo, so prefer applying these
# THREE explicitly via the dashboard SQL editor (paste each file, Run) OR, once
# the migration ledger is reconciled, `supabase db push`. Left as a guarded
# manual step on purpose — bulk auto-apply against a drifted ledger is risky.
if [[ "$FUNCTIONS_ONLY" != "--functions-only" ]]; then
  echo "── Migrations ───────────────────────────────────────────────"
  echo "Apply these 3 new migrations (dashboard SQL editor → paste → Run, in order):"
  for m in 0163_pipeline_health_failure_ratio 0164_notification_outbox_retention 0165_request_dedup; do
    echo "   supabase/migrations/${m}.sql"
  done
  echo "(They are additive + idempotent. Skipping auto-apply to avoid clobbering a drifted ledger.)"
  echo
fi

# ── 2. Edge functions ────────────────────────────────────────────────────────
echo "── Deploying ${#FUNCTIONS[@]} edge functions to ${PROJECT_REF} ──"
for fn in "${FUNCTIONS[@]}"; do
  echo "→ deploying ${fn}"
  supabase functions deploy "${fn}" --project-ref "${PROJECT_REF}"
done
echo "✓ functions deployed (config.toml verify_jwt pins applied)"
echo

# ── 3. Post-deploy CONCURRENTLY indexes (outside a transaction) ──────────────
if [[ "$FUNCTIONS_ONLY" != "--functions-only" ]]; then
  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    echo "── Creating talent pre-filter indexes CONCURRENTLY ──"
    psql "${SUPABASE_DB_URL}" -f supabase/post_deploy/0001_concurrently_indexes.sql
    echo "✓ indexes created (verify with: select indexname from pg_indexes where tablename='talents');"
  else
    echo "SKIP indexes: set SUPABASE_DB_URL to run supabase/post_deploy/0001_concurrently_indexes.sql"
    echo "(or paste it into the dashboard SQL editor — it must NOT run inside a transaction)"
  fi
  echo
fi

# ── 4. Verify ────────────────────────────────────────────────────────────────
echo "── Health check ──"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${HEALTH_URL}" || echo "000")
echo "${HEALTH_URL} → HTTP ${code}  (200 = pipeline alive; 503 = revive the Vault service_role_key first)"
echo
echo "Done. If 503 persists, the Vault service_role_key still needs rotating (see docs/OWNER_ACTIONS.md)."
