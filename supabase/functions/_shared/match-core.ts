/**
 * match-core.ts — shared matching engine
 *
 * Exported by both match-generate (real-time HTTP path) and
 * process-match-queue (batch path) so there is zero code duplication.
 *
 * Error protocol:
 *   Validation / auth failures throw MatchError(message, statusCode).
 *   The HTTP wrapper in match-generate maps these to HTTP responses.
 *   The queue worker catches them and marks the queue item as failed.
 */
import { adminClient } from './supabase.ts'
import { buildPublicReasoning } from './match-reasoning.ts'
import {
  composeFinalScore,
  computeBehavioralFitness,
  computeSalaryFit,
  computeEmploymentFit,
  computeExperienceFit,
  computeEducationFit,
  computeLocationScore,
  computeSkillMatch,
  computeLanguageMatch,
  computeCultureFit,
} from './match-scoring.ts'

// ── Constants ─────────────────────────────────────────────────────────────────

export const CULTURE_KEYS = [
  'wants_wlb', 'wants_fair_pay', 'wants_growth', 'wants_stability',
  'wants_flexibility', 'wants_recognition', 'wants_mission', 'wants_team_culture',
] as const

// ── Public types ──────────────────────────────────────────────────────────────

export interface MatchParams {
  roleId: string
  isExtraMatch?: boolean
  /** True when called from a service-role context (queue worker, cron). Bypasses ownership check. */
  isServiceRole?: boolean
  /** The authenticated user's ID — required when isServiceRole=false. */
  callerUserId?: string
  /**
   * Injected Supabase client — for tests / dependency injection ONLY. Defaults
   * to adminClient(); production callers never pass this, so runtime behaviour is
   * unchanged. This is the seam that makes the orchestration guards unit-testable
   * (see match-core.test.ts) without a live database.
   */
  db?: ReturnType<typeof adminClient>
}

export interface MatchResult {
  matches_added: number
  message?: string
  active_talents?: number
}

export class MatchError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message)
    this.name = 'MatchError'
  }
}

// ── Internal scored-candidate shape (used by scoring loop + reason builder) ──

interface ScoredCandidate {
  talent_id: string
  profile_id: string
  aiSummary: string | null
  tagComp: number
  cultureFit: number
  characterScore: number | null
  characterBucket: string | null
  teamFitScore: number | null
  teamFitBuckets: string[]
  ageScore: number | null
  locationScore: number | null
  backgroundScore: number
  behavioralFitness: number | null
  salaryFit: number | null
  employmentFit: number | null
  feedbackScore: number | null
  experienceFit: number | null
  educationFit: number | null
  careerGoalFit: number | null
  jobIntentionFit: number | null
  talentShortestTenure: number | null
  talentRedFlagsCount: number
  managementStyleFit: number | null
  urgencyFit: number | null
  workArrangementFit: number | null
  talentRoleScopePref: string | null
  finalScore: number
  ghostScore: number
  ghostThreshold: number
  cultureDataSource: string
  cultureComparison: { talent_top_wants: string[]; hm_top_offers: string[]; overlap: string[]; talent_only: string[]; hm_only: string[]; labels: Record<string, string> }
  activeWindowBoth: boolean
  talentNeedsRamp: boolean
  mustHaveItems: string[]
  dealBreakerItems: string[]
  talentBehavioralTags: Record<string, number | null>
  monthlyBoostScore: number
  reasoning: { talent_tag_overlap: Record<string, number>; weight_sum: number }
}

// ── Main exported function ────────────────────────────────────────────────────

export async function matchForRole(params: MatchParams): Promise<MatchResult> {
  const { roleId, isExtraMatch = false, isServiceRole = false, callerUserId } = params
  const db = params.db ?? adminClient()

  // Per-generation memo for IMMUTABLE/STABLE pure-function RPCs
  // (get_life_chart_bucket, get_year_luck_stage). Their arguments come from a tiny
  // finite character/year domain, so across up to 500 candidates the same args
  // recur constantly. Caching the result per distinct args collapses thousands of
  // edge→Postgres round-trips with ZERO scoring change — same inputs always yield
  // the same output. Only SUCCESSFUL results are cached, so a transient RPC error
  // still retries on the next call exactly as the un-memoized code did.
  const _rpcMemo = new Map<string, unknown>()
  // Defensive size bound: the memo lives for a single generation and the key
  // domain is tiny (finite character/year args), so in practice it never grows
  // past a few hundred entries. The cap + simple FIFO eviction (drop the
  // oldest-inserted key once we exceed the limit) is purely defensive against a
  // pathological pool and is behaviour-identical for any realistic generation —
  // we never come close to the bound, and only SUCCESSFUL results are cached, so
  // an evicted key just re-fetches exactly as the un-memoized code did.
  const _RPC_MEMO_MAX = 1000
  async function memoRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const key = fn + ':' + JSON.stringify(args)
    if (_rpcMemo.has(key)) return _rpcMemo.get(key)
    const { data, error } = await db.rpc(fn, args)
    if (!error) {
      if (_rpcMemo.size >= _RPC_MEMO_MAX) {
        // FIFO eviction: Map preserves insertion order, so the first key is the oldest.
        const oldest = _rpcMemo.keys().next().value
        if (oldest !== undefined) _rpcMemo.delete(oldest)
      }
      _rpcMemo.set(key, data)
    }
    return data
  }

  // ── Fetch role ────────────────────────────────────────────────────────────
  const { data: role, error: roleErr } = await db
    .from('roles')
    .select('id, hiring_manager_id, required_traits, status, location_postcode, title, industry, accept_no_experience, employment_type, experience_level, vacancy_expires_at, salary_max, salary_min, work_arrangement, requires_weekend, requires_driving_license, weight_preset, requires_travel, has_night_shifts, requires_own_car, requires_relocation, requires_overtime, is_commission_based, team_member_characters, min_education_level, min_education_class, required_skills, preferred_skills, languages_required, environment_flags, open_to, probation_months, schedule_start_time, schedule_end_time, days_per_week, off_day_pattern, shift_type, eligibility_work_auth, non_negotiables_atoms')
    .eq('id', roleId).single()
  if (roleErr || !role) throw new MatchError('Role not found', 404)
  if (role.status !== 'active') throw new MatchError(`Role status is ${role.status}`, 400)
  const vacancyExpiry = (role as unknown as { vacancy_expires_at: string | null }).vacancy_expires_at
  if (vacancyExpiry && new Date(vacancyExpiry) < new Date()) {
    throw new MatchError('Vacancy has expired — extend it to resume matching', 400)
  }

  // ── Fetch HM data ─────────────────────────────────────────────────────────
  const { data: hm } = await db.from('hiring_managers')
    .select('date_of_birth_encrypted, culture_offers, life_chart_character, must_haves, culture_data_source, hm_quality_factor, hm_cancel_rate, required_work_authorization, career_growth_potential, leadership_tags, hire_urgency, company_id, companies(size)')
    .eq('id', role.hiring_manager_id).maybeSingle()

  const hmCompanySize: string | null =
    (hm as unknown as { companies?: { size: string | null } | null } | null)?.companies?.size ?? null

  // Hard gate: matching requires HM DOB on file. Without it, our scoring is
  // missing core signal — the role is parked rather than producing low-quality
  // matches. The frontend detects HM_DOB_REQUIRED and surfaces a "complete your
  // profile" banner that links back to the onboarding DOB step.
  if (!hm?.date_of_birth_encrypted) {
    throw new MatchError(
      'HM_DOB_REQUIRED: Your hiring profile is missing a date of birth. Add it from your profile so we can match you with the right talent.',
      422,
    )
  }
  let hmDobText: string | null = null
  let cultureOffers: Record<string, number> | null = null
  const hmCharacter: string | null = (hm?.life_chart_character as string | null) ?? null

  if (hm?.date_of_birth_encrypted) {
    const { data: decrypted } = await db.rpc('decrypt_dob', { encrypted: hm.date_of_birth_encrypted })
    hmDobText = (decrypted as string | null) ?? null
  }
  if (hm?.culture_offers && typeof hm.culture_offers === 'object') {
    cultureOffers = hm.culture_offers as Record<string, number>
  }
  const hmRequiredWorkAuth: string[] = Array.isArray((hm as unknown as { required_work_authorization: string[] | null } | null)?.required_work_authorization)
    ? (hm as unknown as { required_work_authorization: string[] }).required_work_authorization
    : []
  const hmCareerGrowthPotential: string | null = (hm as unknown as { career_growth_potential: string | null } | null)?.career_growth_potential ?? null
  const hmLeadershipTags: Record<string, number> = (typeof (hm as unknown as { leadership_tags: unknown } | null)?.leadership_tags === 'object' && (hm as unknown as { leadership_tags: unknown } | null)?.leadership_tags !== null)
    ? (hm as unknown as { leadership_tags: Record<string, number> }).leadership_tags
    : {}
  const hmHireUrgency: string | null = (hm as unknown as { hire_urgency: string | null } | null)?.hire_urgency ?? null

  // Infer HM management style from leadership_tags
  function inferHmManagementStyle(): 'hands_on' | 'autonomous' | 'collaborative' | null {
    if (Object.keys(hmLeadershipTags).length === 0) return null
    const auto    = hmLeadershipTags['offers_autonomy'] ?? 0
    const support = (hmLeadershipTags['supportive'] ?? 0) + (hmLeadershipTags['collaborator'] ?? 0)
    const directive = (hmLeadershipTags['high_performance'] ?? 0) + (hmLeadershipTags['analytical'] ?? 0)
    if (auto > support && auto > directive / 2) return 'autonomous'
    if (support > directive) return 'collaborative'
    if (directive > 0) return 'hands_on'
    return null
  }
  const hmManagementStyle = inferHmManagementStyle()

  // ── Matching weights (overridable via system_config) ──────────────────────
  const teamMemberCharacters: string[] = Array.isArray((role as unknown as { team_member_characters: string[] | null }).team_member_characters)
    ? (role as unknown as { team_member_characters: string[] }).team_member_characters
    : []

  // Batched: one round-trip for all 27 weights instead of 27 separate
  // maybeSingle() queries. Behaviour-preserving — cfgNum() keeps the exact
  // "value is a number, else default" semantics per key (a missing key or a
  // non-numeric value falls back to the same default as before). system_config.key
  // is unique, so the Map holds exactly one value per key.
  const WEIGHT_KEYS = [
    'weight_behavioral_fitness', 'weight_tag_compatibility', 'weight_salary_fit', 'weight_culture_fit',
    'weight_employment_fit', 'weight_character', 'weight_age', 'weight_location', 'weight_background',
    'weight_feedback', 'weight_peak_age', 'weight_monthly_boost', 'weight_experience_fit', 'weight_education_fit',
    'weight_career_goal_fit', 'weight_job_intention_fit', 'weight_management_style_fit', 'weight_urgency_fit',
    'weight_work_arrangement_fit', 'weight_team_fit', 'weight_skill_match', 'weight_language_match',
    'weight_environment_match', 'weight_open_to_match', 'weight_schedule_match', 'weight_probation_comfort',
    'weight_concerns_alignment',
  ]
  // Non-weight scalar config folded into the same round-trip (was 4 separate
  // maybeSingle() reads below). Each value is read back from _weightMap with the
  // exact same type-check + default as its original standalone read.
  const CONFIG_KEYS = [
    ...WEIGHT_KEYS,
    'match_approval_mode', 'lifechart_diversity_v2_enabled', 'refresh_limit_per_role', 'ghost_score_threshold',
  ]
  const { data: weightRows } = await db.from('system_config').select('key, value').in('key', CONFIG_KEYS)
  const _weightMap = new Map<string, unknown>()
  for (const r of (weightRows ?? []) as { key: string; value: unknown }[]) _weightMap.set(r.key, r.value)
  const cfgNum = (key: string, dflt: number): number => {
    const v = _weightMap.get(key)
    return typeof v === 'number' ? v : dflt
  }
  let weightBehavioral = cfgNum('weight_behavioral_fitness', 0.20)
  let weightTag        = cfgNum('weight_tag_compatibility', 0.50)
  let weightSalary     = cfgNum('weight_salary_fit', 0.15)
  let weightCulture    = cfgNum('weight_culture_fit', 0.30)
  let weightEmployment = cfgNum('weight_employment_fit', 0.10)
  let weightCharacter  = cfgNum('weight_character', 0.15)
  let weightAge        = cfgNum('weight_age', 0.05)
  let weightLocation   = cfgNum('weight_location', 0.10)
  let weightBackground = cfgNum('weight_background', 0.15)
  let weightFeedback   = cfgNum('weight_feedback', 0.10)
  let weightPeakAge      = cfgNum('weight_peak_age', 0.10)
  let weightMonthlyBoost = cfgNum('weight_monthly_boost', 0.12)
  let weightExperience    = cfgNum('weight_experience_fit', 0.08)
  let weightEducation     = cfgNum('weight_education_fit', 0.05)
  let weightCareerGoal    = cfgNum('weight_career_goal_fit', 0.06)
  let weightJobIntention  = cfgNum('weight_job_intention_fit', 0.04)
  let weightMgmtStyle     = cfgNum('weight_management_style_fit', 0.07)
  let weightUrgency       = cfgNum('weight_urgency_fit', 0.06)
  let weightWorkArrangement = cfgNum('weight_work_arrangement_fit', 0.08)
  const weightTeamFit         = cfgNum('weight_team_fit', 0.10)
  // v2: structured matching dimensions
  const weightSkillMatch     = cfgNum('weight_skill_match', 0.10)
  const weightLanguageMatch  = cfgNum('weight_language_match', 0.06)
  const weightEnvMatch       = cfgNum('weight_environment_match', 0.03)
  const weightOpenToMatch    = cfgNum('weight_open_to_match', 0.03)
  const weightScheduleMatch  = cfgNum('weight_schedule_match', 0.04)
  const weightProbationComf  = cfgNum('weight_probation_comfort', 0.02)
  const weightConcernsAlign  = cfgNum('weight_concerns_alignment', 0.05)

  // Role-type weight presets
  const roleWeightPreset = ((role as { weight_preset?: string }).weight_preset ?? '').toLowerCase()
  const WEIGHT_PRESETS: Record<string, Partial<Record<string, number>>> = {
    operations: { behavioral: 0.25, tag: 0.45, culture: 0.30, background: 0.15, feedback: 0.15 },
    technical:  { behavioral: 0.30, tag: 0.55, culture: 0.15, background: 0.20, feedback: 0.10 },
    creative:   { behavioral: 0.15, tag: 0.35, culture: 0.35, background: 0.20, feedback: 0.10 },
    sales:      { behavioral: 0.25, tag: 0.40, culture: 0.25, character: 0.20, age: 0.10, feedback: 0.15 },
    management: { behavioral: 0.35, tag: 0.35, culture: 0.35, character: 0.20, age: 0.10, feedback: 0.15 },
  }
  if (roleWeightPreset && WEIGHT_PRESETS[roleWeightPreset]) {
    const p = WEIGHT_PRESETS[roleWeightPreset]
    if (p.behavioral  !== undefined) weightBehavioral = p.behavioral
    if (p.tag         !== undefined) weightTag        = p.tag
    if (p.salary      !== undefined) weightSalary     = p.salary
    if (p.culture     !== undefined) weightCulture    = p.culture
    if (p.employment  !== undefined) weightEmployment = p.employment
    if (p.character   !== undefined) weightCharacter  = p.character
    if ((p as Record<string, number>).experience    !== undefined) weightExperience   = (p as Record<string, number>).experience
    if ((p as Record<string, number>).education     !== undefined) weightEducation    = (p as Record<string, number>).education
    if ((p as Record<string, number>).career_goal   !== undefined) weightCareerGoal   = (p as Record<string, number>).career_goal
    if ((p as Record<string, number>).job_intention !== undefined) weightJobIntention = (p as Record<string, number>).job_intention
    if ((p as Record<string, number>).mgmt_style       !== undefined) weightMgmtStyle       = (p as Record<string, number>).mgmt_style
    if ((p as Record<string, number>).urgency          !== undefined) weightUrgency          = (p as Record<string, number>).urgency
    if ((p as Record<string, number>).work_arrangement !== undefined) weightWorkArrangement  = (p as Record<string, number>).work_arrangement
  }

  // Culture signals from onboarding chat are AI-inferred — reduce weight by half
  // until a HM completes a structured culture survey (culture_data_source = 'survey_verified').
  const hmCultureDataSource = (hm?.culture_data_source as string | null) ?? 'ai_inferred'
  if (hmCultureDataSource === 'ai_inferred') {
    weightCulture = weightCulture * 0.5
  }

  // HM quality factor (0.70–1.0)
  const hmQualityFactor = (hm?.hm_quality_factor as number | null) ?? 1.0
  const hmCancelRate    = (hm?.hm_cancel_rate    as number | null) ?? null

  // ── Ownership check (skipped in service-role / batch context) ─────────────
  if (!isServiceRole && callerUserId) {
    const { data: hmOwner } = await db.from('hiring_managers')
      .select('id').eq('id', role.hiring_manager_id).eq('profile_id', callerUserId).maybeSingle()
    if (!hmOwner) throw new MatchError('Not the role owner', 403)
  }

  // ── Approval mode ─────────────────────────────────────────────────────────
  const _approvalModeVal = _weightMap.get('match_approval_mode')
  const approvalMode: string = typeof _approvalModeVal === 'string'
    ? _approvalModeVal : 'manual'
  const initialStatus = approvalMode === 'autopilot' ? 'generated' : 'pending_approval'

  // ── Life-chart diversity v2 flag ──────────────────────────────────────────
  // When enabled: bad-bucket talents are no longer hard-filtered in SQL; the
  // proposal contains 2 non-bad picks + 1 bad-bucket "contrast" pick. Paid
  // unlocks (isExtraMatch) always return non-bad. When disabled: the Edge
  // Function strips bad-bucket from the pool client-side to preserve the
  // legacy hard-filter behaviour (since the SQL no longer does it).
  const useDiversityV2 = _weightMap.get('lifechart_diversity_v2_enabled') === true

  // ── Active match count guard ──────────────────────────────────────────────
  const activeStatuses = [
    'pending_approval', 'generated', 'viewed', 'accepted_by_talent', 'invited_by_manager',
    'hr_scheduling', 'interview_scheduled', 'interview_completed', 'offer_made',
  ]
  const { count: activeCount } = await db.from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId).in('status', activeStatuses)
  if (!isExtraMatch && (activeCount ?? 0) >= 3) {
    return { matches_added: 0, message: 'Role already has 3 active matches' }
  }

  // ── Refresh-limit guard ───────────────────────────────────────────────────
  const _refreshLimitVal = _weightMap.get('refresh_limit_per_role')
  const refreshLimit = typeof _refreshLimitVal === 'number' ? _refreshLimitVal : 3
  const { count: refreshCount } = await db.from('match_history')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId).eq('action', 'expired_auto')
  if ((refreshCount ?? 0) >= refreshLimit) {
    return { matches_added: 0, message: 'Refresh limit reached' }
  }

  // ── Role flags (needed for RPC call + closure inside scoreTalent) ───────────
  const employmentType: string = ((role as { employment_type?: string }).employment_type || 'full_time').toLowerCase()
  const roleSalaryMax          = (role as unknown as { salary_max: number | null }).salary_max ?? null
  const roleRequiresWeekend    = (role as { requires_weekend?: boolean }).requires_weekend === true
  const roleRequiresDriving    = (role as { requires_driving_license?: boolean }).requires_driving_license === true
  const roleRequiresTravel     = (role as { requires_travel?: boolean }).requires_travel === true
  const roleHasNightShifts     = (role as { has_night_shifts?: boolean }).has_night_shifts === true
  const roleRequiresOwnCar     = (role as { requires_own_car?: boolean }).requires_own_car === true
  const roleRequiresRelocation = (role as { requires_relocation?: boolean }).requires_relocation === true
  const roleRequiresOvertime   = (role as { requires_overtime?: boolean }).requires_overtime === true
  const roleIsCommissionBased  = (role as { is_commission_based?: boolean }).is_commission_based === true
  const roleWorkArrangement    = ((role as { work_arrangement?: string | null }).work_arrangement ?? null)

  // v2: structured role fields
  const roleRequiredSkills: string[]     = Array.isArray((role as { required_skills?: string[] | null }).required_skills)
    ? ((role as { required_skills: string[] }).required_skills) : []
  const rolePreferredSkills: string[]    = Array.isArray((role as { preferred_skills?: string[] | null }).preferred_skills)
    ? ((role as { preferred_skills: string[] }).preferred_skills) : []
  const roleLanguagesRequired: Array<{ code: string; level: string }> =
    Array.isArray((role as { languages_required?: unknown }).languages_required)
      ? ((role as { languages_required: Array<{ code: string; level: string }> }).languages_required) : []
  const roleEnvFlags: string[] = Array.isArray((role as { environment_flags?: string[] | null }).environment_flags)
    ? ((role as { environment_flags: string[] }).environment_flags) : []
  const roleOpenTo: string[] = Array.isArray((role as { open_to?: string[] | null }).open_to)
    ? ((role as { open_to: string[] }).open_to) : []
  const roleMinEducation: string | null = (role as { min_education_level?: string | null }).min_education_level ?? null
  const roleProbationMonths: number | null = (role as { probation_months?: number | null }).probation_months ?? null
  const roleShiftType: string | null = (role as { shift_type?: string | null }).shift_type ?? null
  const roleDaysPerWeek: number | null = (role as { days_per_week?: number | null }).days_per_week ?? null
  const roleOffDayPattern: string | null = (role as { off_day_pattern?: string | null }).off_day_pattern ?? null
  const roleEligibilityWorkAuth: string[] = Array.isArray((role as { eligibility_work_auth?: string[] | null }).eligibility_work_auth)
    ? ((role as { eligibility_work_auth: string[] }).eligibility_work_auth) : []
  const roleNNAtoms: Array<{ type: string; value: unknown; class?: string }> =
    Array.isArray((role as { non_negotiables_atoms?: unknown }).non_negotiables_atoms)
      ? ((role as { non_negotiables_atoms: Array<{ type: string; value: unknown; class?: string }> }).non_negotiables_atoms) : []

  // ── Candidate pool ─────────────────────────────────────────────────────────
  // Hard filters (availability, employment, salary, deal-breakers, work-auth,
  // commission) run inside the DB via get_match_candidates RPC. Life-chart
  // bucket is no longer a hard filter — it's applied at selection time below.
  //
  //   100k talents
  //     → SQL: availability + employment type + salary + deal-breakers
  //            + work-auth + commission conflict
  //     → ~200 survivors  (ordered by feedback_score DESC, capped at 500)
  //     → fetch full rows for those IDs only
  //     → score in chunks of 50 → 2 non-bad + 1 bad-bucket contrast (v2)
  //                              or top 3 non-bad (legacy)

  const { data: prior } = await db.from('matches').select('talent_id').eq('role_id', roleId)
  const excludedIds = (prior ?? []).map((m) => m.talent_id as string)

  const { data: candidateRows, error: candidateErr } = await db.rpc('get_match_candidates', {
    p_employment_type:     employmentType || null,
    p_salary_max:          roleSalaryMax,
    p_hm_character:        hmCharacter,
    p_requires_weekend:    roleRequiresWeekend,
    p_requires_driving:    roleRequiresDriving,
    p_requires_travel:     roleRequiresTravel,
    p_has_night_shifts:    roleHasNightShifts,
    p_requires_own_car:    roleRequiresOwnCar,
    p_requires_relocation: roleRequiresRelocation,
    p_requires_overtime:   roleRequiresOvertime,
    p_is_commission:       roleIsCommissionBased,
    p_work_arrangement:    roleWorkArrangement,
    p_required_work_auth:  hmRequiredWorkAuth.length > 0 ? hmRequiredWorkAuth : null,
    p_excluded_ids:        excludedIds.length > 0 ? excludedIds : null,
    p_limit:               500,
    p_required_skills:     roleRequiredSkills.length > 0 ? roleRequiredSkills : null,
    p_languages_required:  roleLanguagesRequired.length > 0 ? roleLanguagesRequired : null,
    p_min_education:       roleMinEducation,
    p_role_eligibility:    roleEligibilityWorkAuth.length > 0 ? roleEligibilityWorkAuth : null,
    p_role_atoms:          roleNNAtoms.length > 0 ? roleNNAtoms : null,
    p_hm_company_size:     hmCompanySize,
    p_role_industry:       (((role.industry as string | null) || '') || null),
  })
  if (candidateErr) throw new MatchError(`Candidate filter failed: ${candidateErr.message}`, 500)

  const candidateIds = ((candidateRows ?? []) as { talent_id: string }[]).map((r) => r.talent_id)
  console.log(`[match] role=${roleId} candidates after all SQL filters: ${candidateIds.length}`)

  if (candidateIds.length === 0) {
    const { data: talentCount } = await db.rpc('active_talent_count')
    const n = typeof talentCount === 'number' ? talentCount : 0
    if (n < 500) {
      const { error: coldErr } = await db.from('cold_start_queue').insert({ role_id: roleId, status: 'pending' })
      if (coldErr) {
        const isDup = (coldErr.code === '23505') || /duplicate key/i.test(coldErr.message)
        if (!isDup) throw new MatchError(`Cold-start queue insert failed: ${coldErr.message}`, 500)
      }
      return { matches_added: 0, message: 'No eligible talents; flagged for cold start' }
    }
    return { matches_added: 0, message: 'No eligible talents after all filters', active_talents: n }
  }

  // Fetch full profiles only for the filtered candidates (not the whole table)
  const { data: talents } = await db.from('talents')
    .select('id, profile_id, derived_tags, privacy_mode, whitelist_companies, date_of_birth_encrypted, life_chart_character, uses_lunar_calendar, location_matters, location_postcode, open_to_new_field, parsed_resume, deal_breakers, expected_salary_min, expected_salary_max, employment_type_preferences, feedback_score, education_level, has_noncompete, noncompete_industry_scope, salary_structure_preference, career_goal_horizon, job_intention, shortest_tenure_months, red_flags, phs_show_rate, phs_accept_rate, phs_pass_probation_rate, phs_stay_6m_rate, preferred_management_style, notice_period_days, work_arrangement_preference, role_scope_preference, skills, languages_proficiency, available_shifts, available_days_per_week, environment_preferences, candidate_types, priority_concerns_atoms, profiles!inner(ghost_score, is_banned)')
    .in('id', candidateIds)

  const pool = talents ?? []

  // ── Batch the per-candidate age/peak/DOB N+1 into ONE set-based RPC ──────────
  // get_age_peak_scores (migration 0166) decrypts DOB + runs compute_age_match_score
  // + get_peak_age_score for the WHOLE candidate pool in a single round-trip, instead
  // of 3 network RPCs PER candidate (~1,500 round-trips at a 500-candidate pool).
  // Byte-identical: it calls the same three functions with the same inputs + null
  // guards (see migration 0166); the decrypted DOB never leaves SQL.
  const agePeakMap = new Map<string, { age_score: number | null; peak_age_score: number | null }>()
  if (candidateIds.length > 0) {
    const { data: apRows } = await db.rpc('get_age_peak_scores', { p_hm_dob: hmDobText, p_talent_ids: candidateIds })
    for (const r of ((apRows ?? []) as Array<{ talent_id: string; age_score: number | null; peak_age_score: number | null }>)) {
      agePeakMap.set(r.talent_id, { age_score: r.age_score, peak_age_score: r.peak_age_score })
    }
  }

  const _ghostThresholdVal = _weightMap.get('ghost_score_threshold')
  const ghostThreshold = typeof _ghostThresholdVal === 'number' ? _ghostThresholdVal : 3

  const roleTraits: string[] = role.required_traits ?? []
  const rolePostcode: string | null = (role.location_postcode as string | null) ?? null
  const roleTitle = ((role.title as string) || '').toLowerCase()
  const roleIndustry = (((role.industry as string | null) || '') || '').toLowerCase()
  const acceptNoExperience: boolean = (role as { accept_no_experience?: boolean }).accept_no_experience === true
  const experienceLevel: string = ((role as { experience_level?: string }).experience_level || '').toLowerCase()
  const isLongTermRole = employmentType === 'full_time' || employmentType === 'contract'
  const isQualificationRole = experienceLevel === 'senior' || experienceLevel === 'lead'

  // Build canonical industry set from role title tokens
  const roleAliasSet = new Set<string>()
  if (roleIndustry) roleAliasSet.add(roleIndustry)
  for (const tok of roleTitle.split(/[\s,/&]+/)) {
    if (tok && tok.length >= 3) roleAliasSet.add(tok)
  }
  const roleCanonicals = new Set<string>()
  if (roleAliasSet.size > 0) {
    const { data: synRows } = await db.from('industry_synonyms').select('alias, canonical')
      .in('alias', Array.from(roleAliasSet))
    for (const r of (synRows ?? []) as Array<{ alias: string; canonical: string }>) {
      roleCanonicals.add(r.canonical)
    }
  }

  const BUCKET_SCORE: Record<string, number> = { priority: 100, two_match: 70, neutral: 50 }

  const currentYear = new Date().getUTCFullYear()
  let hmStage: number | null = null
  if (hmCharacter) {
    const { data: hmStageRaw } = await db.rpc('get_year_luck_stage', { p_character: hmCharacter, p_year: currentYear })
    if (typeof hmStageRaw === 'number') hmStage = hmStageRaw
  }
  const hmInActiveWindow = hmStage != null && (hmStage === 5 || hmStage === 6 || hmStage === 7)

  const currentMonthFirst = new Date(Date.UTC(currentYear, new Date().getUTCMonth(), 1)).toISOString().slice(0, 10)
  const { data: monthlyBoostRaw } = await db.rpc('get_monthly_boost_characters', { p_month: currentMonthFirst })
  const monthlyBoostedChars: Set<string> = new Set(Array.isArray(monthlyBoostRaw) ? monthlyBoostRaw : [])

  // Alias tokenizer for a talent's job_areas — extracted verbatim from the prior
  // inline loop in backgroundOverlaps so the hoisted batch query (below) and the
  // per-candidate path tokenize IDENTICALLY. For each raw job area: lowercase +
  // trim, push the whole string, then split on /[\s,/&]+/ and push every token of
  // length >= 3. Returns the de-duplicated alias set (same as the old
  // `Array.from(new Set(aliases))`).
  function jobAreaAliases(jobAreas: unknown): string[] {
    const aliases: string[] = []
    if (!Array.isArray(jobAreas)) return aliases
    for (const raw of jobAreas) {
      const a = String(raw ?? '').toLowerCase().trim()
      if (!a) continue
      aliases.push(a)
      for (const tok of a.split(/[\s,/&]+/)) {
        if (tok && tok.length >= 3) aliases.push(tok)
      }
    }
    return Array.from(new Set(aliases))
  }

  // ── Hoisted industry_synonyms batch (B2: kill the per-candidate N+1) ─────────
  // PRIOR behaviour: backgroundOverlaps() ran a `industry_synonyms.select('canonical')
  // .in('alias', …)` query PER CALL, and it was called up to TWICE per candidate
  // (non-compete check + definitive background check) — up to ~1,000 round-trips
  // for a 500-candidate pool.
  //
  // NOW: we collect EVERY candidate's job_areas aliases (tokenized by the SAME
  // jobAreaAliases() the per-candidate path uses), union them into one Set, run
  // ONE `industry_synonyms.select('alias, canonical').in('alias', […])`, and build
  // alias -> canonical[] in memory. backgroundOverlaps() then consults this Map
  // instead of querying the DB.
  //
  // BYTE-IDENTICAL guarantee: the old per-candidate query returned exactly the set
  // of (alias, canonical) rows whose alias is in that candidate's alias set; the
  // map lookup below reconstructs precisely those canonicals (same alias keys →
  // same canonical rows). The `roleCanonicals.has(canonical)` early-return, the
  // title/industry substring fallback, and every early-return are unchanged. The
  // hoist runs only when roleCanonicals.size > 0 (the only case the prior code
  // queried); otherwise the map stays empty and the fallback path is reached
  // exactly as before.
  const aliasCanonicalsMap = new Map<string, string[]>()
  if (roleCanonicals.size > 0) {
    const allAliases = new Set<string>()
    for (const t of pool) {
      const parsedResume = (t as unknown as { parsed_resume: { job_areas?: unknown } | null }).parsed_resume
      for (const a of jobAreaAliases(parsedResume?.job_areas)) allAliases.add(a)
    }
    if (allAliases.size > 0) {
      const { data: synRows } = await db.from('industry_synonyms').select('alias, canonical')
        .in('alias', Array.from(allAliases))
      for (const r of (synRows ?? []) as Array<{ alias: string; canonical: string }>) {
        const arr = aliasCanonicalsMap.get(r.alias)
        if (arr) arr.push(r.canonical)
        else aliasCanonicalsMap.set(r.alias, [r.canonical])
      }
    }
  }

  // Background overlap check (synchronous now — consults the hoisted
  // aliasCanonicalsMap above instead of querying industry_synonyms per call).
  // Result is byte-identical to the prior per-candidate DB path: same alias
  // tokenization (jobAreaAliases), same roleCanonicals.has(canonical) check, same
  // title/industry substring fallback, same early-returns.
  function backgroundOverlaps(jobAreas: unknown): boolean {
    if (!Array.isArray(jobAreas) || jobAreas.length === 0) return false
    if (roleCanonicals.size === 0 && !roleTitle && !roleIndustry) return true
    if (roleCanonicals.size > 0) {
      const aliases = jobAreaAliases(jobAreas)
      if (aliases.length > 0) {
        for (const alias of aliases) {
          const canonicals = aliasCanonicalsMap.get(alias)
          if (!canonicals) continue
          for (const canonical of canonicals) {
            if (roleCanonicals.has(canonical)) return true
          }
        }
      }
    }
    const haystack = `${roleTitle} ${roleIndustry}`
    for (const raw of jobAreas) {
      const a = String(raw ?? '').toLowerCase().trim()
      if (a && (haystack.includes(a) || a.split(/[,\s/]+/).some((tok) => tok && tok.length >= 3 && haystack.includes(tok)))) {
        return true
      }
    }
    return false
  }

  // ── Scoring loop ──────────────────────────────────────────────────────────
  // Process in chunks of 50 to cap concurrent DB calls (~250 at once max).
  // Promise.all over the full pool (up to 1k) × 5-8 RPC calls each would
  // fire ~8k concurrent DB requests and hang Supabase.
  const SCORE_CHUNK = 50
  const scored: (ScoredCandidate | null)[] = []
  for (let i = 0; i < pool.length; i += SCORE_CHUNK) {
    const chunk = pool.slice(i, i + SCORE_CHUNK)
    const chunkResults = await Promise.all(chunk.map((t) => scoreTalent(t)))
    scored.push(...chunkResults)
  }

  async function scoreTalent(t: NonNullable<typeof pool>[number]) {
    const tags = (t.derived_tags ?? {}) as Record<string, number>
    const talentCharacter = (t as unknown as { life_chart_character: string | null }).life_chart_character ?? null
    const talentLocMatters = (t as unknown as { location_matters: boolean }).location_matters === true
    const talentPostcode = (t as unknown as { location_postcode: string | null }).location_postcode ?? null
    const talentOpenNewField = (t as unknown as { open_to_new_field: boolean }).open_to_new_field === true
    const parsedResume = (t as unknown as { parsed_resume: { job_areas?: unknown; ai_summary?: string | null } | null }).parsed_resume
    const talentJobAreas = parsedResume?.job_areas
    const aiSummary = (parsedResume?.ai_summary as string | null) ?? null

    // Character bucket — fetched for SCORING (priority/two_match/neutral/bad).
    // Bad-bucket pairs reach here when diversity-v2 is on (used as the contrast
    // slot in the proposal). When the flag is off, they're stripped from the
    // pool below before selection to preserve legacy behaviour.
    let characterBucket: string | null = null
    if (hmCharacter && talentCharacter) {
      const bucketRaw = await memoRpc('get_life_chart_bucket', { hm_char: hmCharacter, talent_char: talentCharacter })
      characterBucket = (bucketRaw as string | null) ?? null
    }

    // Deal-breaker items — kept for display in public_reasoning only.
    // All hard-filter eliminations already done in SQL.
    type DealBreakers = { items?: string[] }
    const dealBreakers = ((t as unknown as { deal_breakers: DealBreakers | null }).deal_breakers) ?? {}
    const talentDealBreakerItems: string[] = Array.isArray(dealBreakers.items) ? dealBreakers.items : []

    const talentHasNoncompete    = (t as unknown as { has_noncompete: boolean | null }).has_noncompete === true
    const talentNoncompeteScope  = (t as unknown as { noncompete_industry_scope: string | null }).noncompete_industry_scope ?? null

    // Behavioral fitness — pure (see _shared/match-scoring.ts computeBehavioralFitness).
    const behavioralFitness: number | null = computeBehavioralFitness(tags)

    // Salary fit (roleSalaryMax from outer scope) — pure (computeSalaryFit).
    const talentSalMin = (t as unknown as { expected_salary_min: number | null }).expected_salary_min
    const talentSalMax = (t as unknown as { expected_salary_max: number | null }).expected_salary_max
    const salaryFit: number | null = computeSalaryFit(roleSalaryMax, talentSalMin, talentSalMax)

    // Employment type fit — pure (computeEmploymentFit).
    const talentEmpPrefs: string[] = (t as unknown as { employment_type_preferences: string[] | null }).employment_type_preferences ?? []
    const employmentFit: number | null = computeEmploymentFit(employmentType, talentEmpPrefs)

    // Feedback score
    const talentFeedbackRaw = (t as unknown as { feedback_score: number | null }).feedback_score
    const feedbackScore: number | null = talentFeedbackRaw != null ? talentFeedbackRaw * 100 : null

    // Experience fit — pure (computeExperienceFit).
    const talentYearsExp = (parsedResume as { years_experience?: number | null } | null)?.years_experience ?? null
    const experienceFit: number | null = computeExperienceFit(talentYearsExp, experienceLevel)

    // Education fit
    const EDU_MIN: Record<string, string> = {
      junior: 'spm', internship: 'spm', mid: 'diploma', senior: 'degree', lead: 'degree',
    }
    const talentEduLevel = (t as unknown as { education_level: string | null }).education_level ?? null
    // Prefer role-driven minimum; fall back to EDU_MIN by experience_level.
    // If HM ticked accept_no_experience, education becomes a soft signal only
    // (we set educationFit to 100 to avoid penalising; matcher still uses
    // experience_fit + tag_compatibility to gauge actual fit).
    const effectiveMinEdu = roleMinEducation && roleMinEducation !== 'none'
      ? roleMinEducation
      : (experienceLevel && EDU_MIN[experienceLevel]) || null
    // Scoring is pure (computeEducationFit); effectiveMinEdu resolution stays inline
    // because it depends on role/experience closure state.
    const educationFit: number | null = computeEducationFit(talentEduLevel, effectiveMinEdu, acceptNoExperience)

    // Non-compete check (needs background overlap result)
    const bgOverlapsForNoncompete = backgroundOverlaps(
      (parsedResume as { job_areas?: unknown } | null)?.job_areas
    )
    if (talentHasNoncompete && talentNoncompeteScope === 'same_industry' && bgOverlapsForNoncompete) return null

    // Career goal fit
    const talentCareerGoal = (t as unknown as { career_goal_horizon: string | null }).career_goal_horizon ?? null
    let careerGoalFit: number | null = null
    if (talentCareerGoal && hmCareerGrowthPotential) {
      if (hmCareerGrowthPotential === 'dead_end') {
        const wantsGrowth = tags['wants_growth'] ?? 0
        careerGoalFit = wantsGrowth >= 0.6 ? 25 : 55
      } else if (hmCareerGrowthPotential === 'structured_path') {
        careerGoalFit = talentCareerGoal === 'entrepreneurial' ? 55 : 90
      } else {
        careerGoalFit = talentCareerGoal === 'undecided' || talentCareerGoal === 'skill_building' ? 75 : 65
      }
    }

    // Job intention fit
    const talentJobIntention = (t as unknown as { job_intention: string | null }).job_intention ?? null
    let jobIntentionFit: number | null = null
    if (talentJobIntention) {
      if (talentJobIntention === 'long_term_commitment') jobIntentionFit = 100
      else if (talentJobIntention === 'skill_building') jobIntentionFit = 55
      else jobIntentionFit = 75
    }

    // Management style fit
    const talentMgmtStyle = (t as unknown as { preferred_management_style: string | null }).preferred_management_style ?? null
    const MGMT_COMPAT: Record<string, Record<string, number>> = {
      autonomous:    { autonomous: 100, collaborative: 70, hands_on: 30 },
      collaborative: { collaborative: 100, hands_on: 75, autonomous: 65 },
      hands_on:      { hands_on: 100, collaborative: 75, autonomous: 50 },
    }
    let managementStyleFit: number | null = null
    if (talentMgmtStyle && hmManagementStyle) {
      managementStyleFit = MGMT_COMPAT[talentMgmtStyle]?.[hmManagementStyle] ?? 50
    }

    // Urgency fit
    const talentNoticePeriod = (t as unknown as { notice_period_days: number | null }).notice_period_days ?? null
    let urgencyFit: number | null = null
    if (hmHireUrgency && talentNoticePeriod != null) {
      if (hmHireUrgency === 'urgent') {
        urgencyFit = talentNoticePeriod <= 14 ? 100 : talentNoticePeriod <= 30 ? 75 : talentNoticePeriod <= 60 ? 50 : 25
      } else if (hmHireUrgency === 'normal') {
        urgencyFit = talentNoticePeriod <= 30 ? 100 : talentNoticePeriod <= 60 ? 85 : talentNoticePeriod <= 90 ? 70 : 50
      } else {
        urgencyFit = 85
      }
    }

    // Work arrangement fit
    const talentWorkPref = (t as unknown as { work_arrangement_preference: string | null }).work_arrangement_preference ?? null
    const WA_COMPAT: Record<string, Record<string, number>> = {
      remote:  { remote: 100, hybrid: 60,  on_site: 10 },
      hybrid:  { hybrid: 100, remote: 80,  on_site: 60 },
      on_site: { on_site: 100, hybrid: 85, remote: 70 },
    }
    let workArrangementFit: number | null = null
    if (talentWorkPref && roleWorkArrangement) {
      workArrangementFit = WA_COMPAT[talentWorkPref]?.[roleWorkArrangement] ?? 50
    }

    // Tenure / red-flag signals
    const talentShortestTenure = (t as unknown as { shortest_tenure_months: number | null }).shortest_tenure_months ?? null
    const talentRedFlags: string[] = Array.isArray((t as unknown as { red_flags: string[] | null }).red_flags)
      ? (t as unknown as { red_flags: string[] }).red_flags : []

    // Internal year-luck stage
    let talentStage: number | null = null
    if (talentCharacter) {
      const tStageRaw = await memoRpc('get_year_luck_stage', { p_character: talentCharacter, p_year: currentYear })
      if (typeof tStageRaw === 'number') talentStage = tStageRaw
    }
    const talentInActiveWindow = talentStage != null && (talentStage === 5 || talentStage === 6 || talentStage === 7)
    const talentNeedsRamp = talentStage === 4

    // Background fit (definitive call, also used for hard-skip of qual roles)
    const bgOverlaps = backgroundOverlaps(talentJobAreas)
    let backgroundScore = 100
    let backgroundNote = 'matches'
    if (!bgOverlaps) {
      if (isQualificationRole && !acceptNoExperience) return null
      if (acceptNoExperience) {
        backgroundScore = 80; backgroundNote = 'off-field, HM opted-in to no-experience'
      } else if (!isLongTermRole && talentOpenNewField) {
        backgroundScore = 80; backgroundNote = 'off-field, gig/PT role + talent open to new field'
      } else if (!isLongTermRole) {
        backgroundScore = 60; backgroundNote = 'off-field, gig/PT role'
      } else {
        backgroundScore = 30; backgroundNote = 'off-field, full-time/contract — soft-penalised'
      }
    }

    // Trait compatibility
    let sumHits = 0
    const overlap: Record<string, number> = {}
    for (const trait of roleTraits) {
      const strength = tags[trait] ?? 0
      if (strength > 0) { overlap[trait] = strength; sumHits += strength }
    }
    const tagComp = roleTraits.length > 0 ? (sumHits / roleTraits.length) * 100 : 0

    // Culture fit (qualitative only, weight=0) — pure (computeCultureFit).
    const cultureFit = computeCultureFit(tags, cultureOffers, CULTURE_KEYS)

    const CULTURE_LABELS: Record<string, string> = {
      wants_wlb: 'Work-life balance', wants_fair_pay: 'Fair pay',
      wants_growth: 'Growth', wants_stability: 'Stability',
      wants_flexibility: 'Flexibility', wants_recognition: 'Recognition',
      wants_mission: 'Mission-driven', wants_team_culture: 'Team culture',
    }
    const talentTopWants = (CULTURE_KEYS as unknown as string[])
      .filter((k) => (tags[k] ?? 0) >= 0.5)
      .sort((a, b) => (tags[b] ?? 0) - (tags[a] ?? 0))
      .slice(0, 4)
    const hmTopOffers = cultureOffers
      ? (CULTURE_KEYS as unknown as string[])
        .filter((k) => (cultureOffers![k] ?? 0) >= 0.5)
        .sort((a, b) => (cultureOffers![b] ?? 0) - (cultureOffers![a] ?? 0))
        .slice(0, 4)
      : []
    const cultureComparison = {
      talent_top_wants: talentTopWants, hm_top_offers: hmTopOffers,
      overlap: talentTopWants.filter((k) => hmTopOffers.includes(k)),
      talent_only: talentTopWants.filter((k) => !hmTopOffers.includes(k)),
      hm_only: hmTopOffers.filter((k) => !talentTopWants.includes(k)),
      labels: CULTURE_LABELS,
    }

    // Character score
    const characterScore: number | null = characterBucket ? (BUCKET_SCORE[characterBucket] ?? null) : null

    // Team-fit score — average bucket score between talent and each colleague.
    // Bad-bucket colleagues drag the average down; priority/two_match lift it.
    // Skipped if talent has no character or no colleagues provided.
    let teamFitScore: number | null = null
    const teamFitBuckets: string[] = []
    if (talentCharacter && teamMemberCharacters.length > 0) {
      const buckets = await Promise.all(
        teamMemberCharacters.map(async (colleagueChar) => {
          const bRaw = await memoRpc('get_life_chart_bucket', {
            hm_char: colleagueChar, talent_char: talentCharacter,
          })
          return (bRaw as string | null) ?? null
        }),
      )
      const numeric: number[] = []
      for (const b of buckets) {
        if (b) {
          teamFitBuckets.push(b)
          const s = BUCKET_SCORE[b]
          if (typeof s === 'number') numeric.push(s)
          else if (b === 'bad') numeric.push(0)
        }
      }
      if (numeric.length > 0) {
        teamFitScore = numeric.reduce((a, b) => a + b, 0) / numeric.length
      }
    }

    // Age + peak-age — looked up from the per-generation batch (get_age_peak_scores,
    // migration 0166) instead of decrypt_dob + compute_age_match_score +
    // get_peak_age_score PER candidate. Byte-identical: same three functions, same
    // null guards, computed set-based in one round-trip above.
    const _ap = agePeakMap.get(t.id)
    const ageScore: number | null = (_ap && typeof _ap.age_score === 'number') ? _ap.age_score : null

    // Monthly boost
    const monthlyBoostScore: number = (talentCharacter && monthlyBoostedChars.has(talentCharacter)) ? 100 : 0

    // Peak-age-window
    const peakAgeScore: number | null = (_ap && typeof _ap.peak_age_score === 'number') ? _ap.peak_age_score : null

    // Location — pure (computeLocationScore).
    const locationScore: number | null = computeLocationScore(talentLocMatters, talentPostcode, rolePostcode)

    // ── v2: skill match ────────────────────────────────────────────────────
    // Required skills are hard-filtered in SQL — by the time we reach here
    // the talent has ALL of them. Score = required overlap (always 100 if any
    // required) + bonus from preferred-skill overlap, capped at 100.
    // Pure (computeSkillMatch); talentSkills is reused below in concerns alignment.
    const talentSkills: string[] = Array.isArray((t as unknown as { skills: string[] | null }).skills)
      ? (t as unknown as { skills: string[] }).skills : []
    const skillMatch: number | null = computeSkillMatch(roleRequiredSkills, rolePreferredSkills, talentSkills)

    // ── v2: language match (code already hard-filtered; level is soft) ────
    // Pure (computeLanguageMatch).
    const talentLangProf: Array<{ code: string; level: string }> =
      Array.isArray((t as unknown as { languages_proficiency: unknown }).languages_proficiency)
        ? (t as unknown as { languages_proficiency: Array<{ code: string; level: string }> }).languages_proficiency
        : []
    const languageMatch: number | null = computeLanguageMatch(roleLanguagesRequired, talentLangProf)

    // ── v2: environment match ─────────────────────────────────────────────
    const talentEnvPref: string[] = Array.isArray((t as unknown as { environment_preferences: string[] | null }).environment_preferences)
      ? (t as unknown as { environment_preferences: string[] }).environment_preferences : []
    let environmentMatch: number | null = null
    if (roleEnvFlags.length > 0) {
      if (talentEnvPref.length === 0) {
        environmentMatch = 70 // talent unstated — neutral
      } else {
        const overlap = roleEnvFlags.filter((f) => talentEnvPref.includes(f)).length
        environmentMatch = (overlap / roleEnvFlags.length) * 100
      }
    }

    // ── v2: open-to match ─────────────────────────────────────────────────
    const talentCandidateTypes: string[] = Array.isArray((t as unknown as { candidate_types: string[] | null }).candidate_types)
      ? (t as unknown as { candidate_types: string[] }).candidate_types : []
    let openToMatch: number | null = null
    if (roleOpenTo.length > 0) {
      if (talentCandidateTypes.length === 0) {
        openToMatch = 60 // talent unstated — slight penalty (we can't verify fit)
      } else {
        openToMatch = roleOpenTo.some((t2) => talentCandidateTypes.includes(t2)) ? 100 : 30
      }
    }

    // ── v2: schedule match ────────────────────────────────────────────────
    const talentShifts: string[] = Array.isArray((t as unknown as { available_shifts: string[] | null }).available_shifts)
      ? (t as unknown as { available_shifts: string[] }).available_shifts : []
    const talentDaysAvail: number | null = (t as unknown as { available_days_per_week: number | null }).available_days_per_week ?? null
    let scheduleMatch: number | null = null
    if (roleShiftType || roleDaysPerWeek || roleOffDayPattern) {
      const parts: number[] = []
      // Shift compatibility
      if (roleShiftType) {
        if (talentShifts.length === 0) parts.push(60)
        else if (talentShifts.includes('flexible') || talentShifts.includes(roleShiftType)) parts.push(100)
        else if (roleShiftType === 'rotating' && talentShifts.includes('day')) parts.push(60)
        else if (roleShiftType === 'night' && !talentShifts.includes('night')) parts.push(20)
        else parts.push(50)
      }
      // Days/week
      if (roleDaysPerWeek != null) {
        if (talentDaysAvail == null) parts.push(70)
        else parts.push(Math.min(100, (talentDaysAvail / roleDaysPerWeek) * 100))
      }
      // Off-day pattern — light scoring
      if (roleOffDayPattern) parts.push(roleOffDayPattern === 'irregular' ? 60 : 80)
      scheduleMatch = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : null
    }

    // ── v2: probation comfort ─────────────────────────────────────────────
    // Talent's deal_breakers.no_probation (if set true) reduces score when
    // role has any probation. Standard 3 months is widely accepted; longer
    // periods penalised slightly.
    let probationComfort: number | null = null
    if (roleProbationMonths != null) {
      const noProb = ((dealBreakers as Record<string, unknown>)?.no_probation) === true
      if (roleProbationMonths === 0) probationComfort = 100
      else if (noProb) probationComfort = 20
      else if (roleProbationMonths <= 3) probationComfort = 100
      else if (roleProbationMonths <= 6) probationComfort = 80
      else probationComfort = 60
    }

    // ── v2: concerns alignment (NN atoms cross-check) ────────────────────
    // Hard-violation atoms already filtered in SQL. Here we score how well
    // the surviving talent's atoms align with the role spec (and vice versa).
    //
    // Free_text atoms get an extra pass via compare_nn_concerns(): pgvector
    // cosine similarity against the OTHER side's free_text embeddings.
    // cosine_distance <= 0.25 (~similarity >= 0.75) counts as satisfied.
    const talentNNAtoms: Array<{ type: string; value: unknown; class?: string }> =
      Array.isArray((t as unknown as { priority_concerns_atoms: unknown }).priority_concerns_atoms)
        ? (t as unknown as { priority_concerns_atoms: Array<{ type: string; value: unknown; class?: string }> }).priority_concerns_atoms
        : []
    let concernsAlignment: number | null = null
    const concernsSatisfied: string[] = []
    const concernsUnverified: string[] = []
    if (roleNNAtoms.length > 0 || talentNNAtoms.length > 0) {
      const totalAtoms = roleNNAtoms.length + talentNNAtoms.length
      let satisfied = 0

      // Pre-compute free_text alignment for this (role, talent) pair.
      // Map keyed by `${side}:${atom_index}` → { match_text, cosine_distance }.
      // pgvector returns NULL when the other side has no embeddings.
      type FtHit = { match_text: string | null; cosine_distance: number | null }
      const ftHits = new Map<string, FtHit>()
      const SEMANTIC_THRESHOLD = 0.25 // cosine distance; ~similarity >= 0.75
      // The pgvector RPC only feeds the `free_text` branches below (lines ~976/996);
      // if NEITHER side has a free_text atom its result is never read, so skip the
      // query entirely. Behaviour-preserving: with no free_text atoms ftHits would
      // be empty regardless, and the structured branches don't consult it.
      const hasFreeTextAtom =
        roleNNAtoms.some((a) => a.type === 'free_text') ||
        talentNNAtoms.some((a) => a.type === 'free_text')
      if (hasFreeTextAtom) {
        try {
          const { data: ftRows } = await db.rpc('compare_nn_concerns', {
            p_role_id: roleId,
            p_talent_id: t.id,
          })
          for (const row of (ftRows ?? []) as Array<{ side: string; atom_index: number; atom_text: string; match_text: string | null; cosine_distance: number | null }>) {
            ftHits.set(`${row.side}:${row.atom_index}`, {
              match_text: row.match_text,
              cosine_distance: row.cosine_distance,
            })
          }
        } catch { /* embeddings missing — treat all free_text as unverified */ }
      }

      roleNNAtoms.forEach((atom, idx) => {
        if (atom.type === 'min_qualification' && talentEduLevel) {
          satisfied++; concernsSatisfied.push(`role.min_qualification(${String(atom.value)}) — talent edu=${talentEduLevel}`)
        } else if (atom.type === 'salary_floor') {
          satisfied++; concernsSatisfied.push(`role.salary_floor(${String(atom.value)})`)
        } else if (atom.type === 'required_certification' && talentSkills.includes(String(atom.value))) {
          satisfied++; concernsSatisfied.push(`role.required_cert(${String(atom.value)})`)
        } else if (atom.type === 'free_text') {
          const hit = ftHits.get(`role:${idx}`)
          if (hit && hit.cosine_distance != null && hit.cosine_distance <= SEMANTIC_THRESHOLD) {
            satisfied++
            concernsSatisfied.push(`role.free_text("${String(atom.value).slice(0, 40)}…") ≈ talent("${(hit.match_text ?? '').slice(0, 40)}…", d=${hit.cosine_distance.toFixed(2)})`)
          } else {
            concernsUnverified.push(`role: ${String(atom.value).slice(0, 60)}`)
          }
        } else {
          satisfied++ // hard-filtered atoms past SQL → satisfied by definition
        }
      })

      talentNNAtoms.forEach((atom, idx) => {
        if (atom.type === 'salary_floor' && roleSalaryMax != null && (atom.value as number) <= roleSalaryMax) {
          satisfied++; concernsSatisfied.push(`talent.salary_floor met (${String(atom.value)} ≤ ${roleSalaryMax})`)
        } else if (atom.type === 'company_size' && hmCompanySize && Array.isArray(atom.value) && (atom.value as string[]).includes(hmCompanySize)) {
          satisfied++; concernsSatisfied.push(`talent.company_size met (${hmCompanySize})`)
        } else if (atom.type === 'industry_only' && roleIndustry && Array.isArray(atom.value) && (atom.value as string[]).includes(roleIndustry)) {
          satisfied++; concernsSatisfied.push(`talent.industry_only met (${roleIndustry})`)
        } else if (atom.type === 'free_text') {
          const hit = ftHits.get(`talent:${idx}`)
          if (hit && hit.cosine_distance != null && hit.cosine_distance <= SEMANTIC_THRESHOLD) {
            satisfied++
            concernsSatisfied.push(`talent.free_text("${String(atom.value).slice(0, 40)}…") ≈ role("${(hit.match_text ?? '').slice(0, 40)}…", d=${hit.cosine_distance.toFixed(2)})`)
          } else {
            concernsUnverified.push(`talent: ${String(atom.value).slice(0, 60)}`)
          }
        } else {
          satisfied++ // hard-filtered → satisfied
        }
      })

      concernsAlignment = totalAtoms > 0 ? (satisfied / totalAtoms) * 100 : null
    }

    // Dynamic weight normalisation
    const dims: Array<{ name: string; score: number; weight: number }> = [
      { name: 'behavioral_fitness',   score: behavioralFitness ?? 50, weight: weightBehavioral * (behavioralFitness != null ? 1 : 0.5) },
      { name: 'tag_compatibility',    score: tagComp,                 weight: weightTag },
      { name: 'salary_fit',           score: salaryFit ?? 0,          weight: salaryFit        != null ? weightSalary     : 0 },
      { name: 'culture_fit',          score: cultureFit,              weight: 0 },
      { name: 'employment_fit',       score: employmentFit ?? 60,     weight: weightEmployment * (employmentFit != null ? 1 : 0.5) },
      { name: 'character',            score: characterScore ?? 0,     weight: characterScore   != null ? weightCharacter  : 0 },
      { name: 'team_fit',              score: teamFitScore ?? 0,        weight: teamFitScore     != null ? weightTeamFit     : 0 },
      { name: 'age',                  score: ageScore ?? 0,           weight: ageScore         != null ? weightAge        : 0 },
      { name: 'location',             score: locationScore ?? 0,      weight: locationScore    != null ? weightLocation   : 0 },
      { name: 'background',           score: backgroundScore,         weight: weightBackground },
      { name: 'feedback',             score: feedbackScore ?? 50,     weight: weightFeedback   * (feedbackScore != null ? 1 : 0.5) },
      { name: 'peak_age_window',      score: peakAgeScore ?? 0,       weight: peakAgeScore     != null ? weightPeakAge    : 0 },
      { name: 'monthly_boost',        score: monthlyBoostScore,       weight: monthlyBoostedChars.size > 0 ? weightMonthlyBoost : 0 },
      { name: 'experience_fit',       score: experienceFit ?? 0,      weight: experienceFit    != null ? weightExperience : 0 },
      { name: 'education_fit',        score: educationFit ?? 0,       weight: educationFit     != null ? weightEducation    : 0 },
      { name: 'career_goal_fit',      score: careerGoalFit ?? 0,      weight: careerGoalFit    != null ? weightCareerGoal   : 0 },
      { name: 'job_intention_fit',    score: jobIntentionFit ?? 0,    weight: jobIntentionFit  != null ? weightJobIntention : 0 },
      { name: 'management_style_fit', score: managementStyleFit ?? 0, weight: managementStyleFit != null ? weightMgmtStyle : 0 },
      { name: 'urgency_fit',          score: urgencyFit ?? 0,          weight: urgencyFit         != null ? weightUrgency    : 0 },
      { name: 'work_arrangement_fit', score: workArrangementFit ?? 0,  weight: workArrangementFit != null ? weightWorkArrangement : 0 },
      // v2 dimensions
      { name: 'skill_match',           score: skillMatch ?? 0,         weight: skillMatch       != null ? weightSkillMatch    : 0 },
      { name: 'language_match',        score: languageMatch ?? 0,      weight: languageMatch    != null ? weightLanguageMatch : 0 },
      { name: 'environment_match',     score: environmentMatch ?? 0,   weight: environmentMatch != null ? weightEnvMatch      : 0 },
      { name: 'open_to_match',         score: openToMatch ?? 0,        weight: openToMatch      != null ? weightOpenToMatch   : 0 },
      { name: 'schedule_match',        score: scheduleMatch ?? 0,      weight: scheduleMatch    != null ? weightScheduleMatch : 0 },
      { name: 'probation_comfort',     score: probationComfort ?? 0,   weight: probationComfort != null ? weightProbationComf : 0 },
      { name: 'concerns_alignment',    score: concernsAlignment ?? 0,  weight: concernsAlignment!= null ? weightConcernsAlign : 0 },
    ]
    // PHS inputs read from the talent row (reused in `reasoning` below).
    const ghostScore = (t as unknown as { profiles: { ghost_score: number | null } }).profiles?.ghost_score ?? 0
    const phsShowStored   = (t as unknown as { phs_show_rate: number | null }).phs_show_rate
    const phsAcceptStored = (t as unknown as { phs_accept_rate: number | null }).phs_accept_rate
    const phsProbStored   = (t as unknown as { phs_pass_probation_rate: number | null }).phs_pass_probation_rate
    const phsStay6mStored = (t as unknown as { phs_stay_6m_rate: number | null }).phs_stay_6m_rate

    // Final-score composition (weighted-average → PHS multiplier → ghost penalty → clamp).
    // Extracted byte-for-byte to _shared/match-scoring.ts so the money-adjacent scoring
    // math is pure + unit-tested (apps/web/src/lib/matchScoring.test.ts). Behaviour-identical.
    const { rawScore, ghostPenalty, pShow, pAccept, pProbation, pStay6m, phsMultiplier, finalScore, activeDims, effectiveWeights } =
      composeFinalScore(dims, {
        ghostScore, ghostThreshold, hmInActiveWindow, talentInActiveWindow, hmQualityFactor,
        phsShowStored, phsAcceptStored, phsProbStored, phsStay6mStored,
        salaryFit, cultureFit, cultureOffers, employmentFit, backgroundScore, tags, tagComp,
      })

    const mustHaveItems: string[] = Array.isArray((hm as unknown as { must_haves: { items?: string[] } | null } | null)?.must_haves?.items)
      ? ((hm as unknown as { must_haves: { items: string[] } }).must_haves.items) : []

    return {
      talent_id: t.id, profile_id: t.profile_id, aiSummary,
      tagComp, cultureFit, characterScore, characterBucket, teamFitScore, teamFitBuckets, ageScore, locationScore, backgroundScore,
      behavioralFitness, salaryFit, employmentFit, feedbackScore, experienceFit, educationFit,
      careerGoalFit, jobIntentionFit, talentShortestTenure,
      talentRedFlagsCount: talentRedFlags.length,
      managementStyleFit, urgencyFit, workArrangementFit,
      talentRoleScopePref: (t as unknown as { role_scope_preference: string | null }).role_scope_preference ?? null,
      finalScore, ghostScore, ghostThreshold, cultureDataSource: hmCultureDataSource, cultureComparison,
      activeWindowBoth: hmInActiveWindow && talentInActiveWindow, talentNeedsRamp, mustHaveItems,
      dealBreakerItems: talentDealBreakerItems, monthlyBoostScore,
      talentBehavioralTags: {
        ownership: tags['ownership'] ?? null, communication_clarity: tags['communication_clarity'] ?? null,
        emotional_maturity: tags['emotional_maturity'] ?? null, problem_solving: tags['problem_solving'] ?? null,
        resilience: tags['resilience'] ?? null, results_orientation: tags['results_orientation'] ?? null,
        professional_attitude: tags['professional_attitude'] ?? null, confidence: tags['confidence'] ?? null,
        coachability: tags['coachability'] ?? null,
      },
      reasoning: {
        role_traits: roleTraits, talent_tag_overlap: overlap, sum_hits: Number(sumHits.toFixed(3)),
        weight_sum: roleTraits.length, tag_compatibility: Number(tagComp.toFixed(2)),
        behavioral_fitness: behavioralFitness != null ? Number(behavioralFitness.toFixed(2)) : null,
        salary_fit: salaryFit != null ? Number(salaryFit.toFixed(2)) : null,
        employment_fit: employmentFit != null ? Number(employmentFit.toFixed(2)) : null,
        feedback_score_raw: talentFeedbackRaw, culture_fit: Number(cultureFit.toFixed(2)),
        character_bucket: characterBucket, character_score: characterScore, age_score: ageScore,
        team_fit_score: teamFitScore != null ? Number(teamFitScore.toFixed(2)) : null,
        team_fit_buckets: teamFitBuckets, team_size: teamMemberCharacters.length,
        peak_age_window_score: peakAgeScore, monthly_boost_score: monthlyBoostScore,
        location_score: locationScore, location_matters: talentLocMatters,
        background_score: backgroundScore, background_note: backgroundNote,
        experience_fit: experienceFit != null ? Number(experienceFit.toFixed(2)) : null,
        education_fit: educationFit != null ? Number(educationFit.toFixed(2)) : null,
        talent_years_experience: talentYearsExp, talent_education_level: talentEduLevel,
        career_goal_fit: careerGoalFit != null ? Number(careerGoalFit.toFixed(2)) : null,
        job_intention_fit: jobIntentionFit != null ? Number(jobIntentionFit.toFixed(2)) : null,
        talent_career_goal: talentCareerGoal, talent_job_intention: talentJobIntention,
        talent_shortest_tenure_months: talentShortestTenure, hm_career_growth_potential: hmCareerGrowthPotential,
        management_style_fit: managementStyleFit != null ? Number(managementStyleFit.toFixed(2)) : null,
        urgency_fit: urgencyFit != null ? Number(urgencyFit.toFixed(2)) : null,
        work_arrangement_fit: workArrangementFit != null ? Number(workArrangementFit.toFixed(2)) : null,
        talent_mgmt_style: talentMgmtStyle, hm_mgmt_style: hmManagementStyle, hm_hire_urgency: hmHireUrgency,
        talent_notice_period_days: talentNoticePeriod, talent_work_arrangement_pref: talentWorkPref,
        role_work_arrangement: roleWorkArrangement,
        // v2
        skill_match: skillMatch != null ? Number(skillMatch.toFixed(2)) : null,
        language_match: languageMatch != null ? Number(languageMatch.toFixed(2)) : null,
        environment_match: environmentMatch != null ? Number(environmentMatch.toFixed(2)) : null,
        open_to_match: openToMatch != null ? Number(openToMatch.toFixed(2)) : null,
        schedule_match: scheduleMatch != null ? Number(scheduleMatch.toFixed(2)) : null,
        probation_comfort: probationComfort != null ? Number(probationComfort.toFixed(2)) : null,
        concerns_alignment: concernsAlignment != null ? Number(concernsAlignment.toFixed(2)) : null,
        concerns_satisfied: concernsSatisfied,
        concerns_unverified: concernsUnverified,
        role_min_education: roleMinEducation, role_required_skills_count: roleRequiredSkills.length,
        weights: { behavioral: weightBehavioral, tag: weightTag, salary: weightSalary, culture: weightCulture, employment: weightEmployment, character: weightCharacter, age: weightAge, location: weightLocation, background: weightBackground, feedback: weightFeedback, peak_age: weightPeakAge, monthly_boost: weightMonthlyBoost, experience: weightExperience, education: weightEducation, career_goal: weightCareerGoal, job_intention: weightJobIntention, mgmt_style: weightMgmtStyle, urgency: weightUrgency, work_arrangement: weightWorkArrangement, team_fit: weightTeamFit },
        active_dimensions: activeDims, effective_weights: effectiveWeights,
        ghost_score: ghostScore, ghost_penalty: ghostPenalty, raw_score: Number(rawScore.toFixed(2)),
        phs: {
          p_accept: Number(pAccept.toFixed(3)), p_show: Number(pShow.toFixed(3)),
          p_pass_probation: Number(pProbation.toFixed(3)), p_stay_6m: Number(pStay6m.toFixed(3)),
          multiplier: Number(phsMultiplier.toFixed(3)),
          phase: (phsShowStored != null || phsProbStored != null) ? 'data-driven' : 'rule-based',
          hm_quality: {
            factor: Number(hmQualityFactor.toFixed(3)), cancel_rate: hmCancelRate,
            source: hmCancelRate != null ? 'computed' : 'default_new_hm',
          },
        },
        final_score: Number(finalScore.toFixed(2)),
        note: activeDims.join(' + ') + ' (dynamically normalised) × PHS multiplier × HM quality factor.',
      },
    }
  }

  // ── Sort, pick top N, insert ──────────────────────────────────────────────
  const scoredOk = scored.filter((s): s is NonNullable<typeof s> => s !== null)
  scoredOk.sort((a, b) => b.finalScore - a.finalScore)

  const slots = isExtraMatch ? 1 : 3 - (activeCount ?? 0)

  // Selection rule:
  //   v2 on, fresh proposal (slots>=2, not paid unlock):
  //       slots-1 highest-scoring non-bad + 1 highest-scoring bad (contrast).
  //       If no bad-bucket exists, fall back to next-highest non-bad.
  //   v2 on, paid unlock (isExtraMatch) or single-slot top-up:
  //       1 highest-scoring non-bad. Never insert a bad-bucket via paid path.
  //   v2 off (legacy):
  //       Strip bad-bucket from the pool, then top N — matches the prior
  //       hard-filter behaviour now that SQL no longer eliminates them.
  const positiveScored = scoredOk.filter((s) => s.finalScore > 0)
  const nonBad = positiveScored.filter((s) => s.characterBucket !== 'bad')
  const bad    = positiveScored.filter((s) => s.characterBucket === 'bad')
  let top: ScoredCandidate[]
  if (!useDiversityV2) {
    top = nonBad.slice(0, slots)
  } else if (isExtraMatch || slots < 2) {
    top = nonBad.slice(0, slots)
  } else {
    const nNonBad = slots - 1
    const goodPicks = nonBad.slice(0, nNonBad)
    const badPick: ScoredCandidate[] = bad.length > 0 ? [bad[0]!] : nonBad.slice(nNonBad, nNonBad + 1)
    top = [...goodPicks, ...badPick]
    if (top.length < slots) {
      const used = new Set(top.map((s) => s.talent_id))
      for (const s of nonBad) {
        if (top.length >= slots) break
        if (!used.has(s.talent_id)) { top.push(s); used.add(s.talent_id) }
      }
    }
  }

  if (top.length === 0) {
    const { data: talentCount } = await db.rpc('active_talent_count')
    const n = typeof talentCount === 'number' ? talentCount : 0
    if (n < 500) {
      const { error: coldErr } = await db.from('cold_start_queue').insert({ role_id: roleId, status: 'pending' })
      if (coldErr) {
        const isDup = (coldErr.code === '23505') || /duplicate key/i.test(coldErr.message)
        if (!isDup) throw new MatchError(`Cold-start queue insert failed: ${coldErr.message}`, 500)
      }
      return { matches_added: 0, message: 'No eligible talents; flagged for cold start' }
    }
    return { matches_added: 0, message: 'No eligible talents yet', active_talents: n }
  }

  const expiresAt = new Date(Date.now() + 5 * 86400000).toISOString()
  const noisedScores = await Promise.all(
    top.map(async (s) => {
      const { data } = await db.rpc('add_score_noise', { p_score: s.finalScore })
      return typeof data === 'number' ? Number(data.toFixed(2)) : Number(s.finalScore.toFixed(2))
    })
  )
  // Insert matches with application_summary=null first; the recruiter pitch is an
  // LLM call (Anthropic, up to 15s) and must NOT block persisting the match. We
  // generate it after the insert and UPDATE each row by id. The column is nullable
  // and the UI renders it conditionally, so the brief null window is safe; an LLM
  // failure simply leaves the original (null/base) summary.
  const toInsert = top.map((s, i) => ({
    role_id: roleId,
    talent_id: s.talent_id,
    compatibility_score: noisedScores[i],
    tag_compatibility: Number(s.tagComp.toFixed(2)),
    culture_fit_score: Number(s.cultureFit.toFixed(2)),
    life_chart_score: s.characterScore == null ? null : Number(s.characterScore.toFixed(2)),
    internal_reasoning: s.reasoning,
    public_reasoning: buildPublicReasoning(s, roleTraits, useDiversityV2, roleId),
    application_summary: null,
    status: initialStatus,
    expires_at: expiresAt,
    is_extra_match: isExtraMatch,
  }))
  const { data: inserted, error: insErr } = await db.from('matches').insert(toInsert).select('id, talent_id')
  if (insErr) throw new MatchError(insErr.message, 500)

  // Pitch generation moved off the insert path. Map back to inserted rows by
  // talent_id (insert order is not relied upon) and UPDATE; best-effort.
  if (inserted && inserted.length > 0) {
    const idByTalent = new Map<string, string>()
    for (const m of inserted as { id: string; talent_id: string }[]) idByTalent.set(m.talent_id, m.id)
    const summaries = await Promise.all(
      top.map((s) => generateApplicationSummary(role.title as string, roleTraits, s.aiSummary, s.mustHaveItems))
    )
    await Promise.all(
      top.map(async (s, i) => {
        const summary = summaries[i]
        const matchId = idByTalent.get(s.talent_id)
        if (summary == null || !matchId) return
        await db.from('matches').update({ application_summary: summary }).eq('id', matchId)
      })
    )
  }

  await db.from('match_history').insert(
    (inserted ?? []).map((m) => ({ role_id: roleId, talent_id: m.talent_id, action: 'generated' })),
  )

  // Notify talents (autopilot mode only — fire-and-forget)
  if (initialStatus === 'generated') {
    const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    for (const s of top) {
      fetch(notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
        body: JSON.stringify({ user_id: s.profile_id, type: 'match_ready', data: { role_id: roleId, compatibility_score: s.finalScore } }),
      }).catch(() => { /* best effort */ })
    }
  }

  return { matches_added: inserted?.length ?? 0 }
}

// ── Helper: generate LLM application summary ─────────────────────────────────

async function generateApplicationSummary(
  roleTitle: string, traits: string[], baseAiSummary: string | null, mustHaveItems: string[] = [],
): Promise<string | null> {
  if (!baseAiSummary) return null
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) return baseAiSummary

  const traitList = traits.length > 0 ? traits.join(', ') : 'general professional skills'
  const mustHaveSection = mustHaveItems.length > 0
    ? `\n\nThe hiring manager's non-negotiable requirements are:\n${mustHaveItems.map((i) => `- ${i}`).join('\n')}\nNote: these items were declared by the hiring manager but cannot be verified from the AI profile alone — flag them as items to confirm during the interview.`
    : ''
  const prompt = `You are writing a one-sentence hiring pitch. Write exactly ONE sentence (max 30 words) that explains why a candidate who matches the traits "${traitList}" is a strong fit for the role "${roleTitle}". Be specific to the role title. Recruiter-facing. Confident tone. No personal details. Return only the sentence, nothing else.${mustHaveSection}`

  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 15_000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 80, messages: [{ role: 'user', content: prompt }] }),
      signal: ac.signal,
    })
    clearTimeout(t)
    if (res.ok) {
      const data = await res.json() as { content: { type: string; text: string }[] }
      const intro = (data.content?.[0]?.text ?? '').trim().replace(/^["']|["']$/g, '')
      if (intro) return `${intro}\n\n${baseAiSummary}`
    }
  } catch { /* best effort */ }
  return baseAiSummary
}

