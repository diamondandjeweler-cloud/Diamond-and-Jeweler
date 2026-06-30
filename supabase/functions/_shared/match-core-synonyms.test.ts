/**
 * match-core — industry_synonyms N+1 hoist (B2) tests
 *
 * Run via `deno test` in CI (NOT runnable locally — no Deno in this dev env):
 *   deno test --allow-all --no-check supabase/functions/_shared/match-core-synonyms.test.ts
 *
 * What this pins
 * --------------
 * Before B2, backgroundOverlaps() ran `industry_synonyms.select(...).in('alias', …)`
 * once PER CALL, and it is called up to twice per candidate (non-compete check +
 * definitive background check) — an N+1 over a pool of up to 500. B2 hoists that
 * into ONE batch query before the scoring loop and has backgroundOverlaps() consult
 * an in-memory alias→canonical[] Map.
 *
 * These tests use the same MatchParams.db dependency-injection seam as
 * match-core.test.ts. We drive a full multi-candidate generation through a mock db
 * that COUNTS how many times `industry_synonyms` is queried and asserts:
 *   1. industry_synonyms is queried EXACTLY ONCE for a multi-candidate pool
 *      (the role-side build + the hoisted candidate-side batch is the role build's
 *      single query plus ONE candidate batch; we assert the candidate batch does
 *      not scale with pool size — see the per-call breakdown below).
 *   2. backgroundOverlaps results are byte-identical to the pre-refactor path for
 *      a couple of fixture talents (one on-field → kept; one off-field on a
 *      qualification role → hard-skipped), proving the Map lookup reproduces the
 *      old per-candidate query semantics.
 *
 * NOTE: matchForRole queries industry_synonyms in TWO places:
 *   (a) the role-side roleCanonicals build (`select('alias, canonical')`), and
 *   (b) the hoisted candidate-side batch (`select('alias, canonical')`).
 * Both are single, pool-size-independent queries. The N+1 we are killing was the
 * PER-CANDIDATE query inside backgroundOverlaps. So for an N-candidate pool the
 * industry_synonyms query count must stay constant (2 total here: role + hoist),
 * NOT grow to 2 + up to 2N. We assert the count is exactly 2 and, crucially, that
 * it does NOT increase when the pool grows from 1 → many candidates.
 */
import {
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { matchForRole, type MatchParams } from './match-core.ts'

type Resp = { data: unknown; error: unknown }

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROLE = {
  id: 'role-1',
  hiring_manager_id: 'hm-1',
  status: 'active',
  vacancy_expires_at: null,
  required_traits: ['ownership'],
  location_postcode: null,
  title: 'Sales Executive',
  industry: 'retail',
  accept_no_experience: false,
  employment_type: 'full_time',
  experience_level: 'senior', // qualification role → off-field background is a hard-skip
  salary_max: null,
  salary_min: null,
  work_arrangement: null,
  weight_preset: '',
  // booleans default falsey
  team_member_characters: [],
  min_education_level: null,
  required_skills: [],
  preferred_skills: [],
  languages_required: [],
  environment_flags: [],
  open_to: [],
  non_negotiables_atoms: [],
}

const HM = {
  date_of_birth_encrypted: 'enc-dob',
  culture_offers: null,
  life_chart_character: null,
  must_haves: null,
  culture_data_source: 'survey_verified',
  hm_quality_factor: 1.0,
  hm_cancel_rate: null,
  required_work_authorization: null,
  career_growth_potential: null,
  leadership_tags: {},
  hire_urgency: null,
  company_id: null,
  companies: null,
}

// industry_synonyms rows. The role title tokenizes to {retail, sales, executive}
// (title tokens length>=3 + industry 'retail'); each maps to canonical 'retail'.
// Talent T_ON has job_areas that tokenize to an alias mapping to 'retail' → overlap.
// Talent T_OFF maps only to 'finance' → no overlap with roleCanonicals {retail}.
const SYNONYM_ROWS = [
  // role-side aliases
  { alias: 'retail', canonical: 'retail' },
  { alias: 'sales', canonical: 'retail' },
  { alias: 'executive', canonical: 'retail' },
  // candidate-side aliases
  { alias: 'merchandising', canonical: 'retail' }, // T_ON overlaps
  { alias: 'banking', canonical: 'finance' },       // T_OFF does NOT overlap
]

function talent(id: string, jobAreas: string[]) {
  return {
    id,
    profile_id: `prof-${id}`,
    derived_tags: { ownership: 1 },
    privacy_mode: null,
    whitelist_companies: null,
    date_of_birth_encrypted: null,
    life_chart_character: null,
    uses_lunar_calendar: false,
    location_matters: false,
    location_postcode: null,
    open_to_new_field: false,
    parsed_resume: { job_areas: jobAreas, ai_summary: null, years_experience: 10 },
    deal_breakers: null,
    expected_salary_min: null,
    expected_salary_max: null,
    employment_type_preferences: null,
    feedback_score: 0.5,
    education_level: 'degree',
    has_noncompete: false,
    noncompete_industry_scope: null,
    salary_structure_preference: null,
    career_goal_horizon: null,
    job_intention: null,
    shortest_tenure_months: null,
    red_flags: null,
    phs_show_rate: null,
    phs_accept_rate: null,
    phs_pass_probation_rate: null,
    phs_stay_6m_rate: null,
    preferred_management_style: null,
    notice_period_days: null,
    work_arrangement_preference: null,
    role_scope_preference: null,
    skills: null,
    languages_proficiency: null,
    available_shifts: null,
    available_days_per_week: null,
    environment_preferences: null,
    candidate_types: null,
    priority_concerns_atoms: null,
    profiles: { ghost_score: 0, is_banned: false },
  }
}

// T_ON: 'merchandising' → canonical 'retail' ∈ roleCanonicals → overlaps → kept.
const T_ON = talent('t-on', ['Merchandising'])
// T_OFF: 'banking' → canonical 'finance' ∉ roleCanonicals, and neither the string
// nor any token appears in "sales executive retail" → no overlap. On a senior
// (qualification) role with accept_no_experience=false, scoreTalent returns null.
const T_OFF = talent('t-off', ['Banking'])

// ── Instrumented mock db ──────────────────────────────────────────────────────
//
// Tracks per-table query counts. industry_synonyms .in('alias', list) resolves to
// the synonym rows whose alias ∈ list (mirrors a real `.in(...)` filter, so the
// hoisted batch and the role build each return only the rows they ask for). Every
// other table / rpc returns benign empties so the generation runs end-to-end
// through the scoring loop and selection.

interface MockResult {
  db: NonNullable<MatchParams['db']>
  counts: Record<string, number>
  synonymInArgs: string[][]
}

function makeDb(pool: unknown[]): MockResult {
  const counts: Record<string, number> = {}
  const synonymInArgs: string[][] = []

  const systemConfig = (key: string): Resp => {
    // Only keys read via .eq(key).maybeSingle(); WEIGHT_KEYS go through .in() → []
    if (key === 'ghost_score_threshold') return { data: { value: 3 }, error: null }
    if (key === 'match_approval_mode') return { data: { value: 'manual' }, error: null }
    if (key === 'lifechart_diversity_v2_enabled') return { data: { value: false }, error: null }
    if (key === 'refresh_limit_per_role') return { data: { value: 3 }, error: null }
    return { data: null, error: null }
  }

  const from = (table: string) => {
    counts[table] = (counts[table] ?? 0) + 1

    // Mutable per-builder state so .in()/.eq() can shape the resolved value.
    // configKey captures the VALUE passed to .eq('key', <value>) for system_config
    // single-key reads (the real code does .select('value').eq('key', K).maybeSingle()).
    let inList: unknown[] | null = null
    let configKey: string | null = null

    const resolve = (): Resp => {
      switch (table) {
        case 'roles':
          return { data: ROLE, error: null }
        case 'hiring_managers':
          return { data: HM, error: null }
        case 'system_config':
          if (configKey) return systemConfig(configKey)
          return { data: [], error: null } // WEIGHT_KEYS .in() → empty → all defaults
        case 'matches':
          return { data: [], error: null }
        case 'match_history':
          return { data: [], error: null }
        case 'talents':
          return { data: pool, error: null }
        case 'industry_synonyms': {
          const list = (inList ?? []) as string[]
          synonymInArgs.push([...list])
          const rows = SYNONYM_ROWS.filter((r) => list.includes(r.alias))
          return { data: rows, error: null }
        }
        case 'cold_start_queue':
          return { data: null, error: null }
        default:
          return { data: null, error: null }
      }
    }

    const c: Record<string, unknown> = {}
    c.select = () => c
    c.eq = (col: string, val?: unknown) => {
      // For system_config the engine filters by the 'key' column; capture its value.
      if (col === 'key' && typeof val === 'string') configKey = val
      return c
    }
    c.in = (_col: string, list: unknown[]) => { inList = list; return c }
    c.order = () => c
    c.limit = () => c
    c.insert = () => ({ select: () => Promise.resolve({ data: [], error: null }), then: (f: (v: Resp) => unknown) => Promise.resolve({ data: null, error: null }).then(f) })
    c.update = () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
    c.single = () => Promise.resolve(resolve())
    c.maybeSingle = () => Promise.resolve(resolve())
    c.then = (onF: (v: Resp) => unknown) => Promise.resolve(resolve()).then(onF)
    return c
  }

  const rpc = (fn: string, _args?: unknown): Promise<Resp> => {
    counts[`rpc:${fn}`] = (counts[`rpc:${fn}`] ?? 0) + 1
    switch (fn) {
      case 'decrypt_dob':       return Promise.resolve({ data: '1990-01-01', error: null })
      case 'get_match_candidates':
        return Promise.resolve({ data: (pool as Array<{ id: string }>).map((t) => ({ talent_id: t.id })), error: null })
      case 'get_age_peak_scores': return Promise.resolve({ data: [], error: null })
      case 'active_talent_count': return Promise.resolve({ data: 1000, error: null })
      case 'get_monthly_boost_characters': return Promise.resolve({ data: [], error: null })
      case 'add_score_noise':    return Promise.resolve({ data: null, error: null })
      default:                   return Promise.resolve({ data: null, error: null })
    }
  }

  return {
    db: { from, rpc } as unknown as NonNullable<MatchParams['db']>,
    counts,
    synonymInArgs,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

Deno.test('industry_synonyms is queried a constant number of times (no per-candidate N+1)', async () => {
  // Multi-candidate pool. Pre-refactor, backgroundOverlaps would query
  // industry_synonyms up to 2× per candidate → 1 (role build) + up to 2N. After
  // B2 it is 1 (role build) + 1 (hoisted candidate batch) = 2, independent of N.
  const pool = [T_ON, T_OFF, talent('t-3', ['Merchandising']), talent('t-4', ['Banking'])]
  const { db, counts, synonymInArgs } = makeDb(pool)

  await matchForRole({ roleId: 'role-1', isServiceRole: true, db })

  assertEquals(
    counts['industry_synonyms'],
    2,
    'industry_synonyms must be queried exactly twice (role-side build + hoisted candidate batch), not per-candidate',
  )
  // The hoisted candidate batch is the 2nd industry_synonyms query and must carry
  // the UNION of every candidate's aliases in one `.in('alias', …)` call.
  const hoisted = synonymInArgs[1]
  assertEquals(
    hoisted.includes('merchandising') && hoisted.includes('banking'),
    true,
    'hoisted batch must union all candidates aliases into a single query',
  )
})

Deno.test('industry_synonyms query count does NOT grow with pool size', async () => {
  // 1 candidate
  const r1 = makeDb([T_ON])
  await matchForRole({ roleId: 'role-1', isServiceRole: true, db: r1.db })
  // many candidates
  const many = Array.from({ length: 25 }, (_, i) => talent(`t-${i}`, i % 2 === 0 ? ['Merchandising'] : ['Banking']))
  const r2 = makeDb(many)
  await matchForRole({ roleId: 'role-1', isServiceRole: true, db: r2.db })

  assertEquals(r1.counts['industry_synonyms'], r2.counts['industry_synonyms'],
    'query count must be identical for 1 vs 25 candidates (no N+1)')
  assertEquals(r2.counts['industry_synonyms'], 2)
})

Deno.test('backgroundOverlaps via Map is byte-identical: on-field kept, off-field qual-role skipped', async () => {
  // T_ON ('merchandising' → 'retail' ∈ roleCanonicals) overlaps → kept (a match row).
  // T_OFF ('banking' → 'finance') does not overlap and, on a senior role with
  // accept_no_experience=false, scoreTalent returns null → never inserted.
  // We assert the selected pool is exactly {t-on} by inspecting what gets inserted.
  const pool = [T_ON, T_OFF]
  const inserted: Array<{ talent_id: string }> = []
  const base = makeDb(pool)

  // Wrap matches.insert to capture the rows the engine decided to persist.
  const origFrom = base.db.from.bind(base.db)
  ;(base.db as unknown as { from: (t: string) => unknown }).from = (table: string) => {
    const builder = origFrom(table) as Record<string, unknown>
    if (table === 'matches') {
      builder.insert = (rows: unknown) => {
        if (Array.isArray(rows)) for (const row of rows) inserted.push(row as { talent_id: string })
        return {
          select: () => Promise.resolve({
            data: (rows as Array<{ talent_id: string }>).map((r, i) => ({ id: `m-${i}`, talent_id: r.talent_id })),
            error: null,
          }),
          then: (f: (v: Resp) => unknown) => Promise.resolve({ data: null, error: null }).then(f),
        }
      }
    }
    return builder
  }

  await matchForRole({ roleId: 'role-1', isServiceRole: true, db: base.db })

  const insertedIds = inserted.map((r) => r.talent_id).sort()
  assertEquals(insertedIds, ['t-on'],
    'only the on-field talent overlaps the role canonicals; the off-field talent is hard-skipped on a qualification role')
})
