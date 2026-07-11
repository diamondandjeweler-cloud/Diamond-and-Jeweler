-- ============================================================================
-- Post-deploy index existence gate — BLOCKING in CI.
--
-- WHAT IT GUARDS:
--   The talent pre-filter indexes (idx_talents_open / idx_talents_salary_min /
--   idx_talents_emp_type) were authored as CREATE INDEX CONCURRENTLY *inside*
--   migration 0074_match_queue.sql. The migration runner (and `supabase db
--   reset`) wraps each migration in a transaction, so CONCURRENTLY errors with
--   25001 and the index SILENTLY NEVER GETS CREATED. The corrected, out-of-
--   transaction definitions live in supabase/post_deploy/0001_concurrently_
--   indexes.sql and are applied manually in prod (scripts/deploy-backend.sh).
--
--   This gate proves that post_deploy script's index definitions are still
--   well-formed against the CURRENT migrated schema (correct table + columns +
--   types) and that the expected index set has not drifted. If a migration
--   later renames/drops a column the post_deploy indexes reference, this turns
--   CI RED — instead of the failure only surfacing during a prod deploy.
--
-- WHY IT RE-CREATES THE INDEXES HERE (non-CONCURRENTLY):
--   `supabase db reset` cannot create the CONCURRENTLY variants (see above), so
--   after a fresh reset they do not exist. CI's DB is empty, so building them
--   plain (no CONCURRENTLY) is instant and lets us assert the post_deploy
--   definitions actually compile and produce VALID indexes. Plain CREATE INDEX
--   is the legal in-transaction equivalent of the prod CONCURRENTLY form; the
--   resulting catalog object is identical. This file therefore mirrors the
--   index DEFINITIONS in supabase/post_deploy/0001_concurrently_indexes.sql —
--   keep the two in sync when either changes.
--
-- HOW IT RUNS (.github/workflows/ci.yml db-apply job, after `supabase db reset`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/postdeploy_indexes.sql
--   A failing assertion RAISEs → psql exits non-zero → CI is RED.
-- ============================================================================

-- Re-create the post_deploy indexes plain (CI table is empty → instant). These
-- definitions MUST stay byte-for-byte equivalent to the CONCURRENTLY forms in
-- supabase/post_deploy/0001_concurrently_indexes.sql.
CREATE INDEX IF NOT EXISTS idx_talents_open
  ON talents (is_open_to_offers, feedback_score DESC)
  WHERE is_open_to_offers = true;

CREATE INDEX IF NOT EXISTS idx_talents_salary_min
  ON talents (expected_salary_min)
  WHERE is_open_to_offers = true;

CREATE INDEX IF NOT EXISTS idx_talents_emp_type
  ON talents USING GIN (employment_type_preferences)
  WHERE is_open_to_offers = true;

do $$
declare
  expected text[] := array[
    'idx_talents_open',
    'idx_talents_salary_min',
    'idx_talents_emp_type'
  ];
  ix       text;
  missing  text := '';
  invalid  text := '';
  is_valid boolean;
begin
  foreach ix in array expected loop
    -- Present in the public.talents index set?
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'talents' and indexname = ix
    ) then
      missing := missing || ' ' || ix;
      continue;
    end if;
    -- Present but left INVALID (an interrupted CONCURRENTLY build in prod)?
    select i.indisvalid into is_valid
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where c.relname = ix;
    if not is_valid then
      invalid := invalid || ' ' || ix;
    end if;
  end loop;

  if missing <> '' or invalid <> '' then
    raise exception 'POST-DEPLOY INDEX GATE FAILED —%',
      case when missing <> '' then ' missing:' || missing else '' end ||
      case when invalid <> '' then ' invalid:' || invalid else '' end;
  end if;
  raise notice 'POST-DEPLOY INDEX GATE: PASS — all talent pre-filter indexes present and valid';
end;
$$;
