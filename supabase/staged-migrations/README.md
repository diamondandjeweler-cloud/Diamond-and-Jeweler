# Track B — staged backend performance changes (NOT yet applied)

These artifacts are **staged for deliberate, owner-applied deployment**. They live on branch
`perf/track-b-staged` and are **not** in `supabase/migrations/`, so **nothing here auto-applies**.
Each is **unverified by CI** (this machine had no Docker, so no shadow DB, and no Deno for the
matcher test). Prove each on a shadow DB / locally before touching live `sfnrpbsdscikpmbhrzub`.

> Context: a full perf audit shipped **Track A** (7 client fixes) to `main` on 2026-07-01.
> On review, several AUDIT.md backend items were already fixed in-repo:
> **B1** (queue cron) → done in `0151`. **B5** (realtime scoping) → already filtered.
> So only **B2, B3, B4** remained — staged below. **B0** (off-nano compute) is an owner billing action.

## Apply order & numbering

`0170`/`0171` here are **staging tags**. Highest applied migration is `0169`, so at apply time:

| Order | Stage file | Rename to (next free) | Move to |
|------|------------|----------------------|---------|
| 1 | `0170_match_history_retention.sql` | `0170_…` (confirm free) | `supabase/migrations/` |
| 2 | `0171_interview_rounds_rls_denorm.sql` | `0171_…` (confirm free) | `supabase/migrations/` |

Re-check `ls supabase/migrations/ | tail` first — this repo has duplicate prefixes.

---

## Recommended path: prove, then apply

```bash
# 1. Start Docker Desktop, then a local shadow stack
supabase start
supabase db reset            # applies ALL migrations cleanly to the shadow DB

# 2. B4 — prove the RLS deny-suite BEFORE trusting it (outage-class)
psql "$LOCAL_DB_URL" -f supabase/staged-migrations/0171_interview_rounds_rls_denorm.sql
psql "$LOCAL_DB_URL" -f supabase/staged-migrations/0171_interview_rounds_rls_denorm.deny-suite.sql
#   → expect ROLLBACK_OK (green). Any "deny-suite FAILED: […]" => STOP, do not ship.

# 3. B2 — prove the matcher refactor is byte-identical
deno test --allow-all --no-check supabase/functions/_shared/match-core-synonyms.test.ts
deno test --allow-all --no-check supabase/functions/_shared/match-core.test.ts   # existing suite

# 4. Only if all green: move the two .sql into supabase/migrations/ (renumbered), then
supabase db push                                   # B3 + B4 → live
supabase functions deploy match-generate process-match-queue   # B2 → live (edge)
```

---

## B2 — matcher: kill the per-candidate `industry_synonyms` N+1  ·  risk: LOW

- **Files:** `supabase/functions/_shared/match-core.ts` (edited), `…/match-core-synonyms.test.ts` (new test).
- **What:** `backgroundOverlaps()` used to query `industry_synonyms` per candidate (×2 → up to ~1000
  round-trips for a 500 pool). Now one batch query before the scoring loop builds an in-memory
  `alias → canonical[]` map; `backgroundOverlaps()` is pure/synchronous. Tokenization is the same
  extracted helper, so results are **byte-identical**. `memoRpc` got a 1000-entry FIFO bound.
- **Behavior:** preserving (same scores/skips). Deploys via `supabase functions deploy` (NOT git/Vercel).
- **Prove:** `deno test` (above) + an integration spot-check that a real generation produces the same
  matches as before. Reversible: redeploy the prior function version.

## B3 — `match_history` retention  ·  risk: LOW (additive, reversible)

- **File:** `0170_match_history_retention.sql`.
- **What:** idempotent `pg_cron` job `bole-purge-match-history-daily` (03:00) deleting rows older than
  **90 days** (a default — confirm the window). Interim option; a full monthly RANGE-partition +
  auto-DROP sketch is in the file's trailing comment for high-volume scale.
- **Prove:** apply on shadow, confirm the job registers and the DELETE predicate uses `created_at`.
  Reversible: `select cron.unschedule('bole-purge-match-history-daily');`.

## B4 — `interview_rounds` RLS denorm  ·  risk: HIGH (outage-class — RLS regressions here caused prior 503s)

- **Files:** `0171_interview_rounds_rls_denorm.sql` + `…deny-suite.sql`.
- **What:** the two SELECT policies call non-STABLE multi-join `EXISTS` helpers re-evaluated per row.
  Adds denormalized `match_hm_profile_id` / `match_talent_profile_id` (backfilled, indexed, kept fresh
  by a `BEFORE INSERT` trigger), and rewrites **only the SELECT policies** to single-column
  `= (select auth.uid())` checks. `is_hm_for_match`/`is_talent_for_match` are left intact (still used by
  `interview_proposals`). Follows the proven `0124` pattern.
- **MANDATORY before live:** the deny-suite must return `ROLLBACK_OK` on a shadow DB (proves a user
  cannot read another user's rounds, and anon sees none). Do **not** ship on inspection alone.
- **Caveat:** HM identity flows through `roles.hiring_manager_id`. No code reassigns a role's HM today,
  so the denorm is safe; if role-reassignment is ever added, add a propagation trigger + re-backfill.
- Reversible-ish: keep the old helper-based policies handy to swap back if anything misbehaves.

## Not in scope here

- **B1** (queue cron) — already live in `0151`. Routing synchronous `match-generate` through the queue
  is a separate **UX behavior change** (async matching) needing your sign-off, not a migration.
- **B0** (off-nano compute + pooler) — your Supabase dashboard/billing action; the Phase-0 capacity
  floor that gates real load. Do this **before** a public traffic spike.
