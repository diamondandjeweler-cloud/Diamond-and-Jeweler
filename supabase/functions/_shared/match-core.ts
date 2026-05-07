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
  const db = adminClient()

  // ── Fetch role ────────────────────────────────────────────────────────────
  const { data: role, error: roleErr } = await db
    .from('roles')
    .select('id, hiring_manager_id, required_traits, status, location_postcode, title, industry, accept_no_experience, employment_type, experience_level, vacancy_expires_at, salary_max, work_arrangement, requires_weekend, requires_driving_license, weight_preset, requires_travel, has_night_shifts, requires_own_car, requires_relocation, requires_overtime, is_commission_based')
    .eq('id', roleId).single()
  if (roleErr || !role) throw new MatchError('Role not found', 404)
  if (role.status !== 'active') throw new MatchError(`Role status is ${role.status}`, 400)
  const vacancyExpiry = (role as unknown as { vacancy_expires_at: string | null }).vacancy_expires_at
  if (vacancyExpiry && new Date(vacancyExpiry) < new Date()) {
    throw new MatchError('Vacancy has expired — extend it to resume matching', 400)
  }

  // ── Fetch HM data ─────────────────────────────────────────────────────────
  const { data: hm } = await db.from('hiring_managers')
    .select('date_of_birth_encrypted, culture_offers, life_chart_character, must_haves, culture_data_source, hm_quality_factor, hm_cancel_rate, required_work_authorization, career_growth_potential, leadership_tags, hire_urgency')
    .eq('id', role.hiring_manager_id).maybeSingle()

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
  const [wBehRow, wTagRow, wSalRow, wCultureRow, wEmpRow, wCharRow, wAgeRow, wLocRow, wBgRow, wFbRow, wPeakRow, wBoostRow, wExpRow, wEduRow, wCGRow, wJIRow, wMgmtRow, wUrgRow, wWARow] = await Promise.all([
    db.from('system_config').select('value').eq('key', 'weight_behavioral_fitness').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_tag_compatibility').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_salary_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_culture_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_employment_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_character').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_age').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_location').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_background').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_feedback').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_peak_age').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_monthly_boost').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_experience_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_education_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_career_goal_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_job_intention_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_management_style_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_urgency_fit').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'weight_work_arrangement_fit').maybeSingle(),
  ])
  let weightBehavioral = typeof wBehRow.data?.value     === 'number' ? wBehRow.data.value     : 0.20
  let weightTag        = typeof wTagRow.data?.value     === 'number' ? wTagRow.data.value     : 0.50
  let weightSalary     = typeof wSalRow.data?.value     === 'number' ? wSalRow.data.value     : 0.15
  let weightCulture    = typeof wCultureRow.data?.value === 'number' ? wCultureRow.data.value : 0.30
  let weightEmployment = typeof wEmpRow.data?.value     === 'number' ? wEmpRow.data.value     : 0.10
  let weightCharacter  = typeof wCharRow.data?.value    === 'number' ? wCharRow.data.value    : 0.15
  let weightAge        = typeof wAgeRow.data?.value     === 'number' ? wAgeRow.data.value     : 0.05
  let weightLocation   = typeof wLocRow.data?.value     === 'number' ? wLocRow.data.value     : 0.10
  let weightBackground = typeof wBgRow.data?.value      === 'number' ? wBgRow.data.value      : 0.15
  let weightFeedback   = typeof wFbRow.data?.value      === 'number' ? wFbRow.data.value      : 0.10
  let weightPeakAge      = typeof wPeakRow.data?.value  === 'number' ? wPeakRow.data.value    : 0.10
  let weightMonthlyBoost = typeof wBoostRow.data?.value === 'number' ? wBoostRow.data.value   : 0.12
  let weightExperience    = typeof wExpRow.data?.value  === 'number' ? wExpRow.data.value     : 0.08
  let weightEducation     = typeof wEduRow.data?.value  === 'number' ? wEduRow.data.value     : 0.05
  let weightCareerGoal    = typeof wCGRow.data?.value   === 'number' ? wCGRow.data.value      : 0.06
  let weightJobIntention  = typeof wJIRow.data?.value   === 'number' ? wJIRow.data.value      : 0.04
  let weightMgmtStyle     = typeof wMgmtRow.data?.value === 'number' ? wMgmtRow.data.value    : 0.07
  let weightUrgency       = typeof wUrgRow.data?.value  === 'number' ? wUrgRow.data.value     : 0.06
  let weightWorkArrangement = typeof wWARow.data?.value === 'number' ? wWARow.data.value      : 0.08

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
  const { data: approvalModeCfg } = await db.from('system_config').select('value')
    .eq('key', 'match_approval_mode').maybeSingle()
  const approvalMode: string = typeof approvalModeCfg?.value === 'string'
    ? approvalModeCfg.value : 'manual'
  const initialStatus = approvalMode === 'autopilot' ? 'generated' : 'pending_approval'

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
  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', 'refresh_limit_per_role').maybeSingle()
  const refreshLimit = typeof cfg?.value === 'number' ? cfg.value : 3
  const { count: refreshCount } = await db.from('match_history')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId).eq('action', 'expired_auto')
  if ((refreshCount ?? 0) >= refreshLimit) {
    return { matches_added: 0, message: 'Refresh limit reached' }
  }

  // ── Role flags (needed for RPC call + closure inside scoreTalent) ───────────
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

  // ── Candidate pool ─────────────────────────────────────────────────────────
  // ALL hard filters run inside the DB via get_match_candidates RPC.
  // Zero rows for eliminated candidates are ever transferred.
  //
  //   100k talents
  //     → SQL: availability + employment type + salary + deal-breakers
  //            + work-auth + commission conflict + BaZi 'bad' join
  //     → ~200 survivors  (ordered by feedback_score DESC, capped at 500)
  //     → fetch full rows for those IDs only
  //     → score in chunks of 50 → top 3

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
    .select('id, profile_id, derived_tags, privacy_mode, whitelist_companies, date_of_birth_encrypted, life_chart_character, uses_lunar_calendar, location_matters, location_postcode, open_to_new_field, parsed_resume, deal_breakers, expected_salary_min, expected_salary_max, employment_type_preferences, feedback_score, education_level, has_noncompete, noncompete_industry_scope, salary_structure_preference, career_goal_horizon, job_intention, shortest_tenure_months, red_flags, phs_show_rate, phs_accept_rate, phs_pass_probation_rate, phs_stay_6m_rate, preferred_management_style, notice_period_days, work_arrangement_preference, role_scope_preference, profiles!inner(ghost_score, is_banned)')
    .in('id', candidateIds)

  const pool = talents ?? []

  const { data: ghostCfg } = await db.from('system_config').select('value')
    .eq('key', 'ghost_score_threshold').maybeSingle()
  const ghostThreshold = typeof ghostCfg?.value === 'number' ? ghostCfg.value : 3

  const roleTraits: string[] = role.required_traits ?? []
  const rolePostcode: string | null = (role.location_postcode as string | null) ?? null
  const roleTitle = ((role.title as string) || '').toLowerCase()
  const roleIndustry = (((role.industry as string | null) || '') || '').toLowerCase()
  const acceptNoExperience: boolean = (role as { accept_no_experience?: boolean }).accept_no_experience === true
  const employmentType: string = ((role as { employment_type?: string }).employment_type || 'full_time').toLowerCase()
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

  // Background overlap check (async, captures role context via closure)
  async function backgroundOverlaps(jobAreas: unknown): Promise<boolean> {
    if (!Array.isArray(jobAreas) || jobAreas.length === 0) return false
    if (roleCanonicals.size === 0 && !roleTitle && !roleIndustry) return true
    if (roleCanonicals.size > 0) {
      const aliases: string[] = []
      for (const raw of jobAreas) {
        const a = String(raw ?? '').toLowerCase().trim()
        if (!a) continue
        aliases.push(a)
        for (const tok of a.split(/[\s,/&]+/)) {
          if (tok && tok.length >= 3) aliases.push(tok)
        }
      }
      if (aliases.length > 0) {
        const { data: synRows } = await db.from('industry_synonyms').select('canonical')
          .in('alias', Array.from(new Set(aliases)))
        for (const r of (synRows ?? []) as Array<{ canonical: string }>) {
          if (roleCanonicals.has(r.canonical)) return true
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

    // Character bucket — fetched for SCORING (priority/two_match/neutral).
    // 'bad' pairs are already eliminated by get_match_candidates SQL join.
    let characterBucket: string | null = null
    if (hmCharacter && talentCharacter) {
      const { data: bucketRaw } = await db.rpc('get_life_chart_bucket', { hm_char: hmCharacter, talent_char: talentCharacter })
      characterBucket = (bucketRaw as string | null) ?? null
    }

    // Deal-breaker items — kept for display in public_reasoning only.
    // All hard-filter eliminations already done in SQL.
    type DealBreakers = { items?: string[] }
    const dealBreakers = ((t as unknown as { deal_breakers: DealBreakers | null }).deal_breakers) ?? {}
    const talentDealBreakerItems: string[] = Array.isArray(dealBreakers.items) ? dealBreakers.items : []

    const talentHasNoncompete    = (t as unknown as { has_noncompete: boolean | null }).has_noncompete === true
    const talentNoncompeteScope  = (t as unknown as { noncompete_industry_scope: string | null }).noncompete_industry_scope ?? null

    // Behavioral fitness
    const BEHAVIORAL_WEIGHTS: Record<string, number> = {
      ownership: 1.2, communication_clarity: 1.0, emotional_maturity: 1.1,
      problem_solving: 1.1, resilience: 1.0, results_orientation: 1.1,
      professional_attitude: 1.0, confidence: 0.9, coachability: 1.1,
    }
    let bfNum = 0, bfDen = 0
    for (const [key, w] of Object.entries(BEHAVIORAL_WEIGHTS)) {
      const s = tags[key]
      if (s != null) { bfNum += s * w; bfDen += w }
    }
    const behavioralFitness: number | null = bfDen > 0 ? (bfNum / bfDen) * 100 : null

    // Salary fit (roleSalaryMax from outer scope)
    const talentSalMin = (t as unknown as { expected_salary_min: number | null }).expected_salary_min
    const talentSalMax = (t as unknown as { expected_salary_max: number | null }).expected_salary_max
    let salaryFit: number | null = null
    if (roleSalaryMax != null && talentSalMin != null) {
      if (roleSalaryMax >= (talentSalMax ?? talentSalMin)) {
        salaryFit = 100
      } else if (roleSalaryMax >= talentSalMin) {
        const range = (talentSalMax ?? talentSalMin) - talentSalMin
        salaryFit = range > 0 ? 50 + ((roleSalaryMax - talentSalMin) / range) * 50 : 75
      } else {
        const gap = talentSalMin - roleSalaryMax
        salaryFit = Math.max(0, 100 - (gap / talentSalMin) * 200)
      }
    }

    // Employment type fit
    const EMP_COMPAT: Record<string, Record<string, number>> = {
      full_time:  { full_time: 100, contract: 70, part_time: 40, gig: 20, internship: 10 },
      contract:   { full_time: 70,  contract: 100, part_time: 40, gig: 30, internship: 10 },
      part_time:  { full_time: 40,  contract: 40,  part_time: 100, gig: 70, internship: 30 },
      gig:        { full_time: 20,  contract: 30,  part_time: 70,  gig: 100, internship: 40 },
      internship: { full_time: 10,  contract: 10,  part_time: 30,  gig: 40, internship: 100 },
    }
    const talentEmpPrefs: string[] = (t as unknown as { employment_type_preferences: string[] | null }).employment_type_preferences ?? []
    let employmentFit: number | null = null
    if (talentEmpPrefs.length > 0) {
      const row = EMP_COMPAT[employmentType]
      if (row) employmentFit = talentEmpPrefs.reduce((best, pref) => Math.max(best, row[pref] ?? 0), 0)
    }

    // Feedback score
    const talentFeedbackRaw = (t as unknown as { feedback_score: number | null }).feedback_score
    const feedbackScore: number | null = talentFeedbackRaw != null ? talentFeedbackRaw * 100 : null

    // Experience fit
    const EXP_RANGES: Record<string, [number, number]> = {
      junior: [0, 2], internship: [0, 1], mid: [2, 5], senior: [5, 10], lead: [8, 99],
    }
    const talentYearsExp = (parsedResume as { years_experience?: number | null } | null)?.years_experience ?? null
    let experienceFit: number | null = null
    if (talentYearsExp != null && experienceLevel && EXP_RANGES[experienceLevel]) {
      const [rMin, rMax] = EXP_RANGES[experienceLevel]
      if (talentYearsExp >= rMin && talentYearsExp <= rMax) {
        experienceFit = 100
      } else if (talentYearsExp > rMax) {
        experienceFit = Math.max(30, 90 - (talentYearsExp - rMax) * 10)
      } else {
        experienceFit = Math.max(10, 80 - (rMin - talentYearsExp) * 20)
      }
    }

    // Education fit
    const EDU_ORDER: Record<string, number> = {
      spm: 1, diploma: 2, degree: 3, masters: 4, phd: 5, professional_cert: 3, other: 2,
    }
    const EDU_MIN: Record<string, string> = {
      junior: 'spm', internship: 'spm', mid: 'diploma', senior: 'degree', lead: 'degree',
    }
    const talentEduLevel = (t as unknown as { education_level: string | null }).education_level ?? null
    let educationFit: number | null = null
    if (talentEduLevel && experienceLevel && EDU_MIN[experienceLevel]) {
      const talentRank = EDU_ORDER[talentEduLevel] ?? 0
      const minRank    = EDU_ORDER[EDU_MIN[experienceLevel]] ?? 0
      educationFit = talentRank >= minRank ? 100 : Math.max(20, 100 - (minRank - talentRank) * 30)
    }

    // Non-compete check (needs background overlap result)
    const bgOverlapsForNoncompete = await backgroundOverlaps(
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
      const { data: tStageRaw } = await db.rpc('get_year_luck_stage', { p_character: talentCharacter, p_year: currentYear })
      if (typeof tStageRaw === 'number') talentStage = tStageRaw
    }
    const talentInActiveWindow = talentStage != null && (talentStage === 5 || talentStage === 6 || talentStage === 7)
    const talentNeedsRamp = talentStage === 4

    // Background fit (definitive call, also used for hard-skip of qual roles)
    const bgOverlaps = await backgroundOverlaps(talentJobAreas)
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

    // Culture fit (qualitative only, weight=0)
    let cultureFitSum = 0
    for (const key of CULTURE_KEYS) {
      const talentWant = tags[key] ?? 0
      const hmOffer = (cultureOffers ?? {})[key] ?? 0
      cultureFitSum += talentWant * hmOffer
    }
    const cultureFit = (cultureFitSum / CULTURE_KEYS.length) * 100

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

    // Decrypt talent DOB (shared by age + peak-age-window)
    let talentDobText: string | null = null
    if (t.date_of_birth_encrypted) {
      const { data: decrypted } = await db.rpc('decrypt_dob', { encrypted: t.date_of_birth_encrypted })
      if (typeof decrypted === 'string') talentDobText = decrypted
    }

    // Age score
    let ageScore: number | null = null
    if (hmDobText && talentDobText) {
      const { data: ageRaw } = await db.rpc('compute_age_match_score', { hm_dob: hmDobText, talent_dob: talentDobText })
      if (typeof ageRaw === 'number') ageScore = ageRaw
    }

    // Monthly boost
    const monthlyBoostScore: number = (talentCharacter && monthlyBoostedChars.has(talentCharacter)) ? 100 : 0

    // Peak-age-window
    let peakAgeScore: number | null = null
    if (talentDobText && talentCharacter) {
      const bornDay = new Date(talentDobText).getUTCDate()
      const usesLunar = (t as unknown as { uses_lunar_calendar: boolean | null }).uses_lunar_calendar === true
      const { data: peakRaw } = await db.rpc('get_peak_age_score', {
        p_dob: talentDobText, p_character: talentCharacter, p_born_day: bornDay, p_uses_lunar: usesLunar,
      })
      if (typeof peakRaw === 'number') peakAgeScore = peakRaw
    }

    // Location
    let locationScore: number | null = null
    if (talentLocMatters && talentPostcode && rolePostcode) {
      const a = talentPostcode.replace(/\s+/g, '')
      const b = rolePostcode.replace(/\s+/g, '')
      if (a === b) locationScore = 100
      else if (a.length >= 3 && b.length >= 3 && a.slice(0, 3) === b.slice(0, 3)) locationScore = 70
      else if (a.length >= 2 && b.length >= 2 && a.slice(0, 2) === b.slice(0, 2)) locationScore = 40
      else if (a.length >= 1 && b.length >= 1 && a.slice(0, 1) === b.slice(0, 1)) locationScore = 20
      else locationScore = 0
    }

    // Dynamic weight normalisation
    const dims: Array<{ name: string; score: number; weight: number }> = [
      { name: 'behavioral_fitness',   score: behavioralFitness ?? 50, weight: weightBehavioral * (behavioralFitness != null ? 1 : 0.5) },
      { name: 'tag_compatibility',    score: tagComp,                 weight: weightTag },
      { name: 'salary_fit',           score: salaryFit ?? 0,          weight: salaryFit        != null ? weightSalary     : 0 },
      { name: 'culture_fit',          score: cultureFit,              weight: 0 },
      { name: 'employment_fit',       score: employmentFit ?? 60,     weight: weightEmployment * (employmentFit != null ? 1 : 0.5) },
      { name: 'character',            score: characterScore ?? 0,     weight: characterScore   != null ? weightCharacter  : 0 },
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
    ]
    const totalW = dims.reduce((acc, d) => acc + d.weight, 0)
    const rawScore = totalW > 0 ? dims.reduce((acc, d) => acc + d.score * d.weight, 0) / totalW : tagComp

    const ghostScore = (t as unknown as { profiles: { ghost_score: number | null } }).profiles?.ghost_score ?? 0
    const ghostOver = Math.max(0, ghostScore - (ghostThreshold - 1))
    const ghostPenalty = ghostOver * 10
    const activeWindowBoost = (hmInActiveWindow && talentInActiveWindow) ? 5 : 0

    // PHS — Probability of Hire Success
    const phsShowStored   = (t as unknown as { phs_show_rate: number | null }).phs_show_rate
    const phsAcceptStored = (t as unknown as { phs_accept_rate: number | null }).phs_accept_rate
    const phsProbStored   = (t as unknown as { phs_pass_probation_rate: number | null }).phs_pass_probation_rate
    const phsStay6mStored = (t as unknown as { phs_stay_6m_rate: number | null }).phs_stay_6m_rate

    const pShow = phsShowStored ?? Math.max(0.10, 1.0 - ghostScore * 0.15)
    const salFitN = (salaryFit ?? 50) / 100
    const culFitN = cultureOffers != null ? cultureFit / 100 : 0.5
    const empFitN = (employmentFit ?? 60) / 100
    const pAccept = phsAcceptStored ?? (salFitN * 0.6 + culFitN * 0.3 + empFitN * 0.1)
    const ownTag = tags['ownership'] ?? 0.5
    const coaTag = tags['coachability'] ?? 0.5
    const resTag = tags['resilience'] ?? 0.5
    const pProbation = phsProbStored ?? (ownTag * 0.4 + coaTag * 0.35 + resTag * 0.25)
    const pStay6m = phsStay6mStored ?? (pProbation * 0.6 + (backgroundScore / 100) * 0.4)
    const phsMultiplier = 0.60 + 0.40 * (pAccept * pShow * pProbation * pStay6m)

    const finalScore = Math.min(100, Math.max(0,
      rawScore * phsMultiplier * hmQualityFactor - ghostPenalty + activeWindowBoost
    ))

    const activeDims = dims.filter((d) => d.weight > 0).map((d) => d.name)
    const effectiveWeights: Record<string, number> = {}
    if (totalW > 0) {
      for (const d of dims) effectiveWeights[d.name] = d.weight / totalW
    }

    const mustHaveItems: string[] = Array.isArray((hm as unknown as { must_haves: { items?: string[] } | null } | null)?.must_haves?.items)
      ? ((hm as unknown as { must_haves: { items: string[] } }).must_haves.items) : []

    return {
      talent_id: t.id, profile_id: t.profile_id, aiSummary,
      tagComp, cultureFit, characterScore, characterBucket, ageScore, locationScore, backgroundScore,
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
        weights: { behavioral: weightBehavioral, tag: weightTag, salary: weightSalary, culture: weightCulture, employment: weightEmployment, character: weightCharacter, age: weightAge, location: weightLocation, background: weightBackground, feedback: weightFeedback, peak_age: weightPeakAge, monthly_boost: weightMonthlyBoost, experience: weightExperience, education: weightEducation, career_goal: weightCareerGoal, job_intention: weightJobIntention, mgmt_style: weightMgmtStyle, urgency: weightUrgency, work_arrangement: weightWorkArrangement },
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
  const top = scoredOk.slice(0, slots).filter((s) => s.finalScore > 0)

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
  const applicationSummaries = await Promise.all(
    top.map((s) => generateApplicationSummary(role.title as string, roleTraits, s.aiSummary, s.mustHaveItems))
  )
  const noisedScores = await Promise.all(
    top.map(async (s) => {
      const { data } = await db.rpc('add_score_noise', { p_score: s.finalScore })
      return typeof data === 'number' ? Number(data.toFixed(2)) : Number(s.finalScore.toFixed(2))
    })
  )
  const toInsert = top.map((s, i) => ({
    role_id: roleId,
    talent_id: s.talent_id,
    compatibility_score: noisedScores[i],
    tag_compatibility: Number(s.tagComp.toFixed(2)),
    culture_fit_score: Number(s.cultureFit.toFixed(2)),
    life_chart_score: s.characterScore == null ? null : Number(s.characterScore.toFixed(2)),
    internal_reasoning: s.reasoning,
    public_reasoning: buildPublicReasoning(s, roleTraits),
    application_summary: applicationSummaries[i],
    status: initialStatus,
    expires_at: expiresAt,
    is_extra_match: isExtraMatch,
  }))
  const { data: inserted, error: insErr } = await db.from('matches').insert(toInsert).select('id, talent_id')
  if (insErr) throw new MatchError(insErr.message, 500)

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

// ── Helper: build public reasoning for HM ────────────────────────────────────

export function buildPublicReasoning(s: ScoredCandidate, roleTraits: string[]) {
  const overlap = s.reasoning.talent_tag_overlap ?? {}
  const matchedTraits = Object.keys(overlap)
  const missingTraits = roleTraits.filter((t) => !matchedTraits.includes(t))
  const strengths: string[] = []
  const watchouts: string[] = []

  if (matchedTraits.length > 0) strengths.push(`Strong overlap on ${matchedTraits.length}/${roleTraits.length} required traits.`)
  if (s.tagComp >= 70) strengths.push('Skills profile fits the role above the strong-match threshold.')
  else if (s.tagComp >= 40) watchouts.push('Skills overlap is moderate — interview should probe gaps.')
  else watchouts.push('Skills overlap is low — fit will rely on adjacent strengths.')

  const cc = s.cultureComparison
  if (cc.overlap.length >= 3) strengths.push('Strong culture alignment — talent and team share most key priorities.')
  else if (cc.overlap.length === 0 && cc.talent_top_wants.length > 0) watchouts.push('No direct culture overlap detected — discuss team environment and expectations in the interview.')

  if (s.salaryFit != null) {
    if (s.salaryFit >= 90) strengths.push('Salary expectation aligns well with the role offer.')
    else if (s.salaryFit >= 60) watchouts.push('Salary expectation is slightly above the offer range — confirm budget in first call.')
    else if (s.salaryFit < 40) watchouts.push('Significant salary gap — candidate expects considerably more than the role offers. Clarify early.')
  }
  if (s.employmentFit != null && s.employmentFit < 60) {
    watchouts.push('Employment type preference may not match this role — confirm during screening.')
  }
  if (s.behavioralFitness != null) {
    if (s.behavioralFitness >= 75) strengths.push(`Strong behavioural profile overall (${Math.round(s.behavioralFitness)}/100 from interview assessment).`)
    else if (s.behavioralFitness < 50) watchouts.push(`Behavioural interview signals are mixed (${Math.round(s.behavioralFitness)}/100) — structured probing recommended.`)
  }
  if (s.feedbackScore != null) {
    if (s.feedbackScore >= 70) strengths.push('Highly rated by previous hiring managers.')
    else if (s.feedbackScore < 40) watchouts.push('Lower ratings from previous matches — review interview feedback before proceeding.')
  }
  if (s.backgroundScore < 50) watchouts.push('Off-field background — interview should probe motivation and learning curve.')
  else if (s.backgroundScore >= 100) strengths.push('Background experience aligns with the role.')

  if (s.experienceFit != null) {
    if (s.experienceFit >= 90) strengths.push('Years of experience matches role seniority level.')
    else if (s.experienceFit >= 60) watchouts.push('Experience level is slightly mismatched — confirm scope expectations in interview.')
    else if (s.experienceFit >= 40) watchouts.push('Noticeable experience gap — candidate may be over or underqualified. Probe role fit explicitly.')
    else watchouts.push('Significant experience mismatch — validate whether candidate can meet role demands or will be unchallenged.')
  }
  if (s.educationFit != null && s.educationFit < 80) {
    watchouts.push('Education level may be below the typical minimum for this role — verify qualifications before shortlisting.')
  }
  if (s.careerGoalFit != null && s.careerGoalFit < 50) {
    watchouts.push('Career goal may not align with what this role offers — clarify growth expectations and promotion path in the interview.')
  } else if (s.careerGoalFit != null && s.careerGoalFit >= 85) {
    strengths.push('Career direction aligns well with what this role offers.')
  }
  if (s.jobIntentionFit != null && s.jobIntentionFit < 70) {
    watchouts.push('Candidate indicated they are looking to gain specific experience before moving on — confirm long-term commitment expectations early.')
  }

  let doubtCount = 0
  if (s.tagComp < 40) doubtCount++
  if (s.salaryFit != null && s.salaryFit < 40) doubtCount++
  if (s.behavioralFitness != null && s.behavioralFitness < 40) doubtCount++
  if (s.feedbackScore != null && s.feedbackScore < 30) doubtCount++
  if (s.backgroundScore < 40) doubtCount++
  if (s.careerGoalFit != null && s.careerGoalFit < 40) doubtCount++
  if (s.educationFit != null && s.educationFit < 60) doubtCount++
  if (s.talentRedFlagsCount > 0) doubtCount++
  if (s.talentShortestTenure != null && s.talentShortestTenure < 12) doubtCount++
  if (doubtCount >= 4) {
    watchouts.push(`Platform signals ${doubtCount}/8 evaluation dimensions as uncertain. A wrong hire costs 3+ months' salary plus team morale — a structured second-round interview is strongly recommended before shortlisting.`)
  }
  if (s.ghostScore >= s.ghostThreshold) {
    watchouts.push('This candidate has been slow to respond in previous matches — build extra lead time into your outreach and set a clear response deadline.')
  }
  if (s.cultureDataSource === 'ai_inferred') {
    watchouts.push('Culture signals are self-reported via AI onboarding — treat as indicative, not verified. Confirm values and working style in the interview.')
  }
  if (s.monthlyBoostScore === 100) strengths.push('Favourable-period match — platform signals this month as a strong window for this candidate. Prioritise outreach.')
  if (s.activeWindowBoth) strengths.push('Strong-momentum match — recommend moving quickly while both sides are actively engaged.')
  if (s.talentNeedsRamp) watchouts.push('Likely growth hire — expect a 1–2 year ramp before full performance. Plan onboarding and mentorship accordingly.')
  if (s.ageScore != null && s.ageScore < 50) watchouts.push('Reporting-line age dynamic to consider.')
  if (s.locationScore != null && s.locationScore < 40) watchouts.push('Commute distance may be a factor — confirm during interview.')
  if (missingTraits.length > 0) watchouts.push(`Trait gaps to discuss: ${missingTraits.slice(0, 4).join(', ')}.`)

  const bt = s.talentBehavioralTags ?? {}
  const BEHAVIORAL_LABELS: Record<string, string> = {
    ownership: 'personal accountability', communication_clarity: 'communication clarity',
    emotional_maturity: 'emotional maturity', problem_solving: 'problem-solving logic',
    resilience: 'resilience under failure', results_orientation: 'results orientation',
    professional_attitude: 'professional attitude', confidence: 'confident self-presentation',
    coachability: 'coachability',
  }
  const strongBehavior: string[] = []
  const weakBehavior: string[] = []
  for (const [key, label] of Object.entries(BEHAVIORAL_LABELS)) {
    const score = bt[key]
    if (score == null) continue
    if (score >= 0.75) strongBehavior.push(label)
    else if (score <= 0.35) weakBehavior.push(label)
  }
  if (strongBehavior.length > 0) strengths.push(`Behavioural interview signals strong ${strongBehavior.slice(0, 3).join(', ')}.`)
  if (weakBehavior.length > 0) watchouts.push(`Interview showed weak signals on: ${weakBehavior.slice(0, 3).join(', ')} — probe these.`)
  if (s.mustHaveItems.length > 0) watchouts.push(`Verify HM's non-negotiables in interview: ${s.mustHaveItems.slice(0, 3).join('; ')}.`)
  if (s.dealBreakerItems.length > 0) watchouts.push(`Talent's non-negotiables (must be honoured): ${s.dealBreakerItems.slice(0, 3).join('; ')}.`)

  return {
    score_band: s.finalScore >= 75 ? 'strong' : s.finalScore >= 50 ? 'good' : 'cautious',
    strengths, watchouts, matched_traits: matchedTraits, missing_traits: missingTraits,
    behavioral_tags: bt, culture_comparison: s.cultureComparison,
    note: 'This explanation summarises platform signals. Final hiring decisions remain yours.',
  }
}
