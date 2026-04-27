#!/usr/bin/env bash
#
# Regenerate apps/web/src/types/db.generated.ts from the Supabase schema.
#
# Usage:
#   ./scripts/generate-types.sh              # against local `supabase start`
#   ./scripts/generate-types.sh <project-id> # against a remote Supabase project
#
# Requires: supabase CLI installed + authenticated (`supabase login`).

set -euo pipefail

OUTPUT="apps/web/src/types/db.generated.ts"

if ! command -v supabase > /dev/null; then
  echo "supabase CLI not found. Install: npm install -g supabase" >&2
  exit 1
fi

if [[ "${1:-}" == "" ]]; then
  echo "Generating types from LOCAL Supabase (supabase start must be running)…"
  supabase gen types typescript --local > "$OUTPUT"
else
  PROJECT_ID="$1"
  echo "Generating types from REMOTE project $PROJECT_ID…"
  supabase gen types typescript --project-id "$PROJECT_ID" > "$OUTPUT"
fi

echo "✓ Wrote $OUTPUT"
echo "  $(wc -l < "$OUTPUT") lines"
