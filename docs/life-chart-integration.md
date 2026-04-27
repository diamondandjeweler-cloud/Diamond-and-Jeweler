# Life-chart integration guide

The platform ships with a life-chart stub that always returns `null`, so the
matching engine falls back to tag-only scoring. Plug your proprietary
algorithm into the SQL function below to activate the 30% life-chart weight.

## Data model

Three tables are already provisioned in [0001_schema.sql](../supabase/migrations/0001_schema.sql):

| Table | Purpose |
|---|---|
| `public.life_chart_base`        | Base number per DOB range + gender. Your algorithm's primary lookup. |
| `public.life_chart_adjustments` | Month/day adjustments by gender. Applied after the base lookup. |
| `public.life_chart_cache`       | Memoised scores for DOB pairs. Cleared automatically never — live computations are stable per pair. |

RLS restricts all three to admin-only (see [0003_rls.sql](../supabase/migrations/0003_rls.sql)).

## The function

`public.compute_life_chart_score(dob1 date, dob2 date) → numeric` lives in
[0008_life_chart_function.sql](../supabase/migrations/0008_life_chart_function.sql).
It's the only hook: `match-generate` calls this via `supabase.rpc` during
scoring and passes both DOBs in plaintext (decrypted server-side).

Current contract:

1. **Order-independent** — we normalise `(least, greatest)` inside the function.
2. **Cache memoisation** — non-null results are written to `life_chart_cache`; subsequent identical pairs are O(1).
3. **Return value**
   - A number `0..100` that represents compatibility for the pair.
   - `NULL` when there isn't enough data. `match-generate` then uses tag-only scoring for that candidate.

## Plugging in your algorithm

1. Populate `life_chart_base` and `life_chart_adjustments` from your source data. A one-off SQL `INSERT` or `\copy` is fine.
2. Replace the placeholder block inside `compute_life_chart_score` (clearly marked with `>>>> YOUR PROPRIETARY ALGORITHM GOES HERE <<<<`). Keep the cache write at the bottom.
3. Re-run the migration (or `supabase db push` / apply the patched SQL). The function is `CREATE OR REPLACE`, so no drop needed.
4. No frontend or Edge-Function changes are required. The next call to `match-generate` will pick up real scores.

## Weighting

Final match score = `tag_compatibility × weight_tag_compatibility + life_chart_score × weight_life_chart`.

The weights live in `public.system_config` (defaults: `0.7` / `0.3`) and are
editable live in the Admin → Config tab. When `life_chart_score` is `null`,
match-generate uses `tag_compatibility` directly rather than silently re-weighting.

## Testing

```sql
-- Quick sanity check once plugged in:
select public.compute_life_chart_score('1990-05-15', '1985-11-02');
-- Expect: a number 0..100 (or NULL if your data doesn't cover that pair).

-- Round-trip via match-generate (requires a live role + talent):
select public.is_admin();                                                    -- true
select id, status from public.roles where status = 'active' limit 1;         -- pick a role_id
-- Then POST /functions/v1/match-generate { role_id: '<id>' } with the admin JWT.
```

## Security properties that must not change

- `compute_life_chart_score` is `SECURITY DEFINER` — runs with the function owner's privileges.
- Grant chain: `execute` to `service_role` (called from Edge Functions) and `authenticated` (so admins can call it ad-hoc). **Do not grant to `anon`.**
- The function receives plaintext DOBs. Edge Functions decrypt via `public.decrypt_dob()` before calling it — the DOB never appears in client traffic.
- If you add schema access to anything else inside the function body, set `SET search_path = public` at the top to prevent shadowing attacks.
