/**
 * match-generate
 *
 * Generates matches for a role (up to 3 active matches at any time).
 *
 * Hard filters (skip the talent entirely if any fail):
 *   - life-chart character bucket = 'bad' for this (HM, talent) pair
 *   - background-mismatch on a senior/lead role where HM did not opt-in to no-experience
 *
 * Soft scoring dimensions (each 0–100, dynamically normalised):
 *   behavioral_fitness — weighted avg of 9 behavioural interview tags (always-on when present)
 *   tag_compatibility  — talent derived_tags vs role required_traits
 *   salary_fit         — overlap between talent salary expectation and role salary_max
 *   culture_fit        — talent wants_* vs hiring_manager culture_offers
 *   employment_fit     — talent preferred employment types vs role employment_type
 *   character          — life-chart bucket: priority=100, two_match=70, neutral=50
 *   age                — HM same-age-or-older = 100, sliding penalty otherwise
 *   location           — postcode proximity, gated on talent.location_matters
 *   background         — overlap of talent job_areas with role title/industry
 *   feedback           — pre-computed talent.feedback_score from HM ratings
 *
 * Default weights (overridable via system_config):
 *   weight_behavioral_fitness = 0.20
 *   weight_tag_compatibility  = 0.50
 *   weight_salary_fit         = 0.15
 *   weight_culture_fit        = 0.30
 *   weight_employment_fit     = 0.10
 *   weight_character          = 0.15
 *   weight_age                = 0.05
 *   weight_location           = 0.10  (only counts when talent.location_matters)
 *   weight_background         = 0.15
 *   weight_feedback           = 0.10  (only counts when feedback exists)
 *
 * Triggers:
 *   - Hiring manager POSTing a new role → called from client after insert.
 *   - match-expire Edge Function when a slot frees up.
 *   - Admin / cold-start tooling.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body { role_id?: string; is_extra_match?: boolean }

// The 8 preference dimensions that are cross-scored between talent and HM.
const CULTURE_KEYS = [
  'wants_wlb', 'wants_fair_pay', 'wants_growth', 'wants_stability',
  'wants_flexibility', 'wants_recognition', 'wants_mission', 'wants_team_culture',
] as const

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['hiring_manager', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* empty body tolerated */ }
  if (!body.role_id) return json({ error: 'Missing role_id' }, 400)

  const db = adminClient()

  const { data: role, error: roleErr } = await db
    .from('roles')
    .select('id, hiring_manager_id, required_traits, status, location_postcode, title, industry, accept_no_experience, employment_type, experience_level, vacancy_expires_at, salary_max, requires_weekend, requires_driving_license, weight_preset')
    .eq('id', body.role_id).single()
  if (roleErr || !role) return json({ error: 'Role not found' }, 404)
  if (role.status !== 'active') return json({ error: `Role status is ${role.status}` }, 400)
  const vacancyExpiry = (role as unknown as { vacancy_expires_at: string | null }).vacancy_expires_at
  if (vacancyExpiry && new Date(vacancyExpiry) < new Date()) {
    return json({ error: 'Vacancy has expired — extend it to resume matching' }, 400)
  }

  // Resolve HM data: DOB + character + culture_offers.
  const { data: hm } = await db.from('hiring_managers')
    .select('date_of_birth_encrypted, culture_offers, life_chart_character, must_haves, culture_data_source')
    .eq('id', role.hiring_manager_id).maybeSingle()
  let hmDobText: string | null = null
  let cultureOffers: Record<string, number> | null = null
  const hmCharacter: string | null = (hm?.life_chart_character as string | null) ?? null

  if (hm?.date_of_birth_encrypted) {
    const { data: decrypted } = await db.rpc('decrypt_dob', {
      encrypted: hm.date_of_birth_encrypted,
    })
    hmDobText = (decrypted as string | null) ?? null
  }
  if (hm?.culture_offers && typeof hm.culture_offers === 'object') {
    cultureOffers = hm.culture_offers as Record<string, number>
  }

  // Matching weights, overridable via system_config.
  const [wBehRow, wTagRow, wSalRow, wCultureRow, wEmpRow, wCharRow, wAgeRow, wLocRow, wBgRow, wFbRow] = await Promise.all([
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

  // Fix e: role-type weight presets — shift relative emphasis for different role families.
  const roleWeightPreset = ((role as { weight_preset?: string }).weight_preset ?? '').toLowerCase()
  const WEIGHT_PRESETS: Record<string, Partial<Record<string, number>>> = {
    // Operations: reliability + culture + feedback matter most
    operations: { behavioral: 0.25, tag: 0.45, culture: 0.30, background: 0.15, feedback: 0.15 },
    // Technical: hard skills + background + behavioural rigor
    technical:  { behavioral: 0.30, tag: 0.55, culture: 0.15, background: 0.20, feedback: 0.10 },
    // Creative: culture + style fit + background
    creative:   { behavioral: 0.15, tag: 0.35, culture: 0.35, background: 0.20, feedback: 0.10 },
    // Sales: relationship signals + character + feedback from prior HMs
    sales:      { behavioral: 0.25, tag: 0.40, culture: 0.25, character: 0.20, age: 0.10, feedback: 0.15 },
    // Management: leadership behaviourals + culture alignment + seniority signals
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
    if (p.age         !== undefined) weightAge        = p.age
    if (p.location    !== undefined) weightLocation   = p.location
    if (p.background  !== undefined) weightBackground = p.background
    if (p.feedback    !== undefined) weightFeedback   = p.feedback
  }

  // Fix c: culture signals from onboarding chat are AI-inferred — reduce weight by half
  // until a HM completes a structured culture survey (culture_data_source = 'survey_verified').
  const hmCultureDataSource = (hm?.culture_data_source as string | null) ?? 'ai_inferred'
  if (hmCultureDataSource === 'ai_inferred') {
    weightCulture = weightCulture * 0.5
  }

  // Ownership check for HM callers.
  if (auth.role === 'hiring_manager' && !auth.isServiceRole) {
    const { data: hmOwner } = await db.from('hiring_managers')
      .select('id').eq('id', role.hiring_manager_id).eq('profile_id', auth.userId).maybeSingle()
    if (!hmOwner) return json({ error: 'Not the role owner' }, 403)
  }

  // How many active matches does this role already have?
  const activeStatuses = [
    'generated','viewed','accepted_by_talent','invited_by_manager',
    'hr_scheduling','interview_scheduled','interview_completed','offer_made',
  ]
  const { count: activeCount } = await db.from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', body.role_id).in('status', activeStatuses)
  const isExtra = body.is_extra_match === true
  if (!isExtra && (activeCount ?? 0) >= 3) {
    return json({ message: 'Role already has 3 active matches', matches_added: 0 })
  }

  // Refresh-limit guard prevents runaway regeneration after expiries.
  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', 'refresh_limit_per_role').maybeSingle()
  const refreshLimit = typeof cfg?.value === 'number' ? cfg.value : 3
  const { count: refreshCount } = await db.from('match_history')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', body.role_id).eq('action', 'expired_auto')
  if ((refreshCount ?? 0) >= refreshLimit) {
    return json({ message: 'Refresh limit reached', matches_added: 0 })
  }

  // Exclude talents already matched to this role (regardless of status).
  const { data: prior } = await db.from('matches').select('talent_id').eq('role_id', body.role_id)
  const excluded = new Set((prior ?? []).map((m) => m.talent_id))

  // Candidate pool: open, non-expired talents.
  const now = new Date().toISOString()
  const { data: talents } = await db.from('talents')
    .select('id, profile_id, derived_tags, privacy_mode, whitelist_companies, date_of_birth_encrypted, life_chart_character, location_matters, location_postcode, open_to_new_field, parsed_resume, deal_breakers, expected_salary_min, expected_salary_max, employment_type_preferences, feedback_score, profiles!inner(ghost_score, is_banned)')
    .eq('is_open_to_offers', true)
    .eq('profiles.is_banned', false)
    .or(`profile_expires_at.is.null,profile_expires_at.gte.${now}`)
  const pool = (talents ?? []).filter((t) => !excluded.has(t.id))

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

  // Build the role-side canonical industry set up front.
  // Token-tokenise role.title (and use role.industry as-is) to look up synonyms.
  const roleAliasSet = new Set<string>()
  if (roleIndustry) roleAliasSet.add(roleIndustry)
  for (const tok of roleTitle.split(/[\s,/&]+/)) {
    if (tok && tok.length >= 3) roleAliasSet.add(tok)
  }
  const roleCanonicals = new Set<string>()
  if (roleAliasSet.size > 0) {
    const { data: synRows } = await db
      .from('industry_synonyms')
      .select('alias, canonical')
      .in('alias', Array.from(roleAliasSet))
    for (const r of (synRows ?? []) as Array<{ alias: string; canonical: string }>) {
      roleCanonicals.add(r.canonical)
    }
  }

  const BUCKET_SCORE: Record<string, number> = {
    priority: 100,
    two_match: 70,
    neutral: 50,
  }

  // Internal stage signals (private — never echoed to UI in stage form).
  const currentYear = new Date().getUTCFullYear()
  let hmStage: number | null = null
  if (hmCharacter) {
    const { data: hmStageRaw } = await db.rpc('get_year_luck_stage', {
      p_character: hmCharacter,
      p_year: currentYear,
    })
    if (typeof hmStageRaw === 'number') hmStage = hmStageRaw
  }
  const hmInActiveWindow = hmStage != null && (hmStage === 5 || hmStage === 6 || hmStage === 7)

  async function backgroundOverlaps(jobAreas: unknown): Promise<boolean> {
    if (!Array.isArray(jobAreas) || jobAreas.length === 0) return false
    if (roleCanonicals.size === 0 && !roleTitle && !roleIndustry) return true  // no role-side metadata; don't penalise

    // Canonical-set comparison via synonyms (preferred).
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
        const { data: synRows } = await db
          .from('industry_synonyms')
          .select('canonical')
          .in('alias', Array.from(new Set(aliases)))
        for (const r of (synRows ?? []) as Array<{ canonical: string }>) {
          if (roleCanonicals.has(r.canonical)) return true
        }
      }
    }

    // Substring fallback for unsynonymised aliases.
    const haystack = `${roleTitle} ${roleIndustry}`
    for (const raw of jobAreas) {
      const a = String(raw ?? '').toLowerCase().trim()
      if (a && (haystack.includes(a) || a.split(/[,\s/]+/).some((tok) => tok && tok.length >= 3 && haystack.includes(tok)))) {
        return true
      }
    }
    return false
  }

  const scored = await Promise.all(pool.map(async (t) => {
    const tags = (t.derived_tags ?? {}) as Record<string, number>
    const talentCharacter = (t as unknown as { life_chart_character: string | null }).life_chart_character ?? null
    const talentLocMatters = (t as unknown as { location_matters: boolean }).location_matters === true
    const talentPostcode = (t as unknown as { location_postcode: string | null }).location_postcode ?? null
    const talentOpenNewField = (t as unknown as { open_to_new_field: boolean }).open_to_new_field === true
    const parsedResume = (t as unknown as { parsed_resume: { job_areas?: unknown; ai_summary?: string | null } | null }).parsed_resume
    const talentJobAreas = parsedResume?.job_areas
    const aiSummary = (parsedResume?.ai_summary as string | null) ?? null

    // ── Hard filter: character bad-match ──
    let characterBucket: string | null = null
    if (hmCharacter && talentCharacter) {
      const { data: bucketRaw } = await db.rpc('get_life_chart_bucket', {
        hm_char: hmCharacter,
        talent_char: talentCharacter,
      })
      characterBucket = (bucketRaw as string | null) ?? null
      if (characterBucket === 'bad') {
        return null  // hard-fail; talent never appears as a match
      }
    }

    // ── Hard filter: deal-breakers (talent) ──────────────────────────────────
    type DealBreakers = {
      items?: string[]
      min_salary_hard?: number | null
      no_weekend_work?: boolean
      no_driving_license?: boolean
    }
    const dealBreakers = ((t as unknown as { deal_breakers: DealBreakers | null }).deal_breakers) ?? {}
    const talentDealBreakerItems: string[] = Array.isArray(dealBreakers.items) ? dealBreakers.items : []
    const talentMinSalaryHard = (dealBreakers.min_salary_hard as number | null | undefined) ?? null
    const talentNoWeekendWork = dealBreakers.no_weekend_work === true
    const talentNoDrivingLicense = dealBreakers.no_driving_license === true

    const roleSalaryMaxForFilter = (role as unknown as { salary_max: number | null }).salary_max ?? null
    const roleRequiresWeekend = (role as { requires_weekend?: boolean }).requires_weekend === true
    const roleRequiresDrivingLicense = (role as { requires_driving_license?: boolean }).requires_driving_license === true

    // Fix d: structured hard filters — eliminate role before any scoring
    if (talentMinSalaryHard != null && roleSalaryMaxForFilter != null && roleSalaryMaxForFilter < talentMinSalaryHard) {
      return null  // role salary cap is below talent's hard floor
    }
    if (talentNoWeekendWork && roleRequiresWeekend) {
      return null  // weekend conflict
    }
    if (talentNoDrivingLicense && roleRequiresDrivingLicense) {
      return null  // driving licence conflict
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Behavioral fitness: weighted avg of 9 behavioural interview tags ──────
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

    // ── Salary fit ────────────────────────────────────────────────────────────
    const talentSalMin = (t as unknown as { expected_salary_min: number | null }).expected_salary_min
    const talentSalMax = (t as unknown as { expected_salary_max: number | null }).expected_salary_max
    const roleSalaryMax = (role as unknown as { salary_max: number | null }).salary_max ?? null
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

    // ── Employment type fit ───────────────────────────────────────────────────
    const EMP_COMPAT: Record<string, Record<string, number>> = {
      full_time:  { full_time: 100, contract: 70, part_time: 40, gig: 20, internship: 10 },
      contract:   { full_time: 70,  contract: 100, part_time: 40, gig: 30, internship: 10 },
      part_time:  { full_time: 40,  contract: 40,  part_time: 100, gig: 70, internship: 30 },
      gig:        { full_time: 20,  contract: 30,  part_time: 70,  gig: 100, internship: 40 },
      internship: { full_time: 10,  contract: 10,  part_time: 30,  gig: 40, internship: 100 },
    }
    const talentEmpPrefs: string[] = (t as unknown as { employment_type_preferences: string[] | null }).employment_type_preferences ?? []
    const roleEmpType = employmentType
    let employmentFit: number | null = null
    if (talentEmpPrefs.length > 0) {
      const row = EMP_COMPAT[roleEmpType]
      if (row) {
        employmentFit = talentEmpPrefs.reduce((best, pref) => Math.max(best, row[pref] ?? 0), 0)
      }
    }

    // ── Feedback score ────────────────────────────────────────────────────────
    const talentFeedbackRaw = (t as unknown as { feedback_score: number | null }).feedback_score
    const feedbackScore: number | null = talentFeedbackRaw != null ? talentFeedbackRaw * 100 : null

    // ── Internal stage signals for the talent (private). ──
    let talentStage: number | null = null
    if (talentCharacter) {
      const { data: tStageRaw } = await db.rpc('get_year_luck_stage', {
        p_character: talentCharacter,
        p_year: currentYear,
      })
      if (typeof tStageRaw === 'number') talentStage = tStageRaw
    }
    const talentInActiveWindow = talentStage != null && (talentStage === 5 || talentStage === 6 || talentStage === 7)
    const talentNeedsRamp = talentStage === 4

    // ── Background fit: hard-skip qualification roles, else soft penalty ──
    const bgOverlaps = await backgroundOverlaps(talentJobAreas)
    let backgroundScore = 100
    let backgroundNote = 'matches'
    if (!bgOverlaps) {
      if (isQualificationRole && !acceptNoExperience) {
        return null  // hard-skip: senior/lead role + HM did not opt-in to no-experience
      }
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

    // ── Dimension 1: trait compatibility (role required_traits vs talent tags) ──
    let sumHits = 0
    const overlap: Record<string, number> = {}
    for (const trait of roleTraits) {
      const strength = tags[trait] ?? 0
      if (strength > 0) { overlap[trait] = strength; sumHits += strength }
    }
    const tagComp = roleTraits.length > 0 ? (sumHits / roleTraits.length) * 100 : 0

    // ── Dimension 2: culture fit (talent wants_* vs HM culture_offers) ──
    let cultureFitSum = 0
    for (const key of CULTURE_KEYS) {
      const talentWant = tags[key] ?? 0
      const hmOffer = (cultureOffers ?? {})[key] ?? 0
      cultureFitSum += talentWant * hmOffer
    }
    const cultureFit = (cultureFitSum / CULTURE_KEYS.length) * 100

    // ── Dimension 3: character bucket (replaces legacy bazi-score path) ──
    const characterScore: number | null = characterBucket
      ? (BUCKET_SCORE[characterBucket] ?? null)
      : null

    // ── Dimension 4: age (HM same-age-or-older = 100, sliding penalty otherwise) ──
    let ageScore: number | null = null
    if (hmDobText && t.date_of_birth_encrypted) {
      const { data: talentDob } = await db.rpc('decrypt_dob', {
        encrypted: t.date_of_birth_encrypted,
      })
      if (typeof talentDob === 'string') {
        const { data: ageRaw } = await db.rpc('compute_age_match_score', {
          hm_dob: hmDobText, talent_dob: talentDob,
        })
        if (typeof ageRaw === 'number') ageScore = ageRaw
      }
    }

    // ── Dimension 5: location (gated on talent.location_matters) ──
    // Postcode prefix proximity (Malaysia 5-digit postcodes):
    //   exact match    -> 100
    //   first 3 digits -> 70  (same district)
    //   first 2 digits -> 40  (same state-area)
    //   first 1 digit  -> 20  (same region)
    //   else           -> 0
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

    // ── Final score: dynamic weight normalisation across active dimensions ──
    // Fix g: neutral imputation for missing-data dimensions instead of zero-weight skip.
    // When a signal is absent we use a neutral score with half the normal weight so the
    // dimension still exerts mild gravitational pull without dominating.  Genuinely
    // optional dimensions (location, character, age, salary, culture) still drop to zero
    // weight when the underlying data is entirely absent.
    const dims: Array<{ name: string; score: number; weight: number }> = [
      { name: 'behavioral_fitness', score: behavioralFitness ?? 50, weight: weightBehavioral * (behavioralFitness != null ? 1 : 0.5) },
      { name: 'tag_compatibility',  score: tagComp,                 weight: weightTag },
      { name: 'salary_fit',         score: salaryFit ?? 0,          weight: salaryFit        != null ? weightSalary     : 0 },
      { name: 'culture_fit',        score: cultureFit,              weight: cultureOffers    != null ? weightCulture    : 0 },
      { name: 'employment_fit',     score: employmentFit ?? 60,     weight: weightEmployment * (employmentFit != null ? 1 : 0.5) },
      { name: 'character',          score: characterScore ?? 0,     weight: characterScore   != null ? weightCharacter  : 0 },
      { name: 'age',                score: ageScore ?? 0,           weight: ageScore         != null ? weightAge        : 0 },
      { name: 'location',           score: locationScore ?? 0,      weight: locationScore    != null ? weightLocation   : 0 },
      { name: 'background',         score: backgroundScore,         weight: weightBackground },
      { name: 'feedback',           score: feedbackScore ?? 50,     weight: weightFeedback   * (feedbackScore != null ? 1 : 0.5) },
    ]
    const totalW = dims.reduce((acc, d) => acc + d.weight, 0)
    const rawScore = totalW > 0
      ? dims.reduce((acc, d) => acc + d.score * d.weight, 0) / totalW
      : tagComp

    // Ghost-score deprioritisation (v4 §16).
    const ghostScore = (t as unknown as { profiles: { ghost_score: number | null } }).profiles?.ghost_score ?? 0
    const ghostOver = Math.max(0, ghostScore - (ghostThreshold - 1))
    const ghostPenalty = ghostOver * 10

    // Active-window boost: both sides in a strong-move period get a small bump
    // so the priority sort surfaces them faster. Capped at 100.
    const activeWindowBoost = (hmInActiveWindow && talentInActiveWindow) ? 5 : 0

    const finalScore = Math.min(100, Math.max(0, rawScore - ghostPenalty + activeWindowBoost))

    const activeDims = dims.filter((d) => d.weight > 0).map((d) => d.name)
    const effectiveWeights: Record<string, number> = {}
    if (totalW > 0) {
      for (const d of dims) effectiveWeights[d.name] = d.weight / totalW
    }

    const mustHaveItems: string[] = Array.isArray((hm as unknown as { must_haves: { items?: string[] } | null } | null)?.must_haves?.items)
      ? ((hm as unknown as { must_haves: { items: string[] } }).must_haves.items)
      : []

    return {
      talent_id: t.id,
      profile_id: t.profile_id,
      aiSummary,
      tagComp,
      cultureFit,
      characterScore,
      characterBucket,
      ageScore,
      locationScore,
      backgroundScore,
      behavioralFitness,
      salaryFit,
      employmentFit,
      feedbackScore,
      finalScore,
      ghostScore,
      ghostThreshold,
      cultureDataSource: hmCultureDataSource,
      activeWindowBoth: hmInActiveWindow && talentInActiveWindow,
      talentNeedsRamp,
      mustHaveItems,
      dealBreakerItems: talentDealBreakerItems,
      talentBehavioralTags: {
        ownership:            tags['ownership']            ?? null,
        communication_clarity: tags['communication_clarity'] ?? null,
        emotional_maturity:   tags['emotional_maturity']   ?? null,
        problem_solving:      tags['problem_solving']      ?? null,
        resilience:           tags['resilience']           ?? null,
        results_orientation:  tags['results_orientation']  ?? null,
        professional_attitude: tags['professional_attitude'] ?? null,
        confidence:           tags['confidence']           ?? null,
        coachability:         tags['coachability']         ?? null,
      },
      reasoning: {
        role_traits: roleTraits,
        talent_tag_overlap: overlap,
        sum_hits: Number(sumHits.toFixed(3)),
        weight_sum: roleTraits.length,
        tag_compatibility: Number(tagComp.toFixed(2)),
        behavioral_fitness: behavioralFitness != null ? Number(behavioralFitness.toFixed(2)) : null,
        salary_fit: salaryFit != null ? Number(salaryFit.toFixed(2)) : null,
        employment_fit: employmentFit != null ? Number(employmentFit.toFixed(2)) : null,
        feedback_score_raw: talentFeedbackRaw,
        culture_fit: Number(cultureFit.toFixed(2)),
        character_bucket: characterBucket,
        character_score: characterScore,
        age_score: ageScore,
        location_score: locationScore,
        location_matters: talentLocMatters,
        background_score: backgroundScore,
        background_note: backgroundNote,
        // Internal-only fields (admin-visible, never echoed to UI). Track stage
        // signals so we can audit the engine without exposing the method.
        _internal_hm_stage: hmStage,
        _internal_talent_stage: talentStage,
        _internal_active_window_boost: activeWindowBoost,
        weights: { behavioral: weightBehavioral, tag: weightTag, salary: weightSalary, culture: weightCulture, employment: weightEmployment, character: weightCharacter, age: weightAge, location: weightLocation, background: weightBackground, feedback: weightFeedback },
        active_dimensions: activeDims,
        effective_weights: effectiveWeights,
        ghost_score: ghostScore,
        ghost_penalty: ghostPenalty,
        raw_score: Number(rawScore.toFixed(2)),
        final_score: Number(finalScore.toFixed(2)),
        note: activeDims.join(' + ') + ' (dynamically normalised).',
      },
    }
  }))
  const scoredOk = scored.filter((s): s is NonNullable<typeof s> => s !== null)
  scoredOk.sort((a, b) => b.finalScore - a.finalScore)

  const slots = isExtra ? 1 : 3 - (activeCount ?? 0)
  const top = scoredOk.slice(0, slots).filter((s) => s.finalScore > 0)

  if (top.length === 0) {
    const { data: talentCount } = await db.rpc('active_talent_count')
    const n = typeof talentCount === 'number' ? talentCount : 0
    if (n < 500) {
      const { error: coldErr } = await db.from('cold_start_queue')
        .insert({ role_id: body.role_id, status: 'pending' })
      if (coldErr) {
        const isDup = (coldErr.code === '23505') || /duplicate key/i.test(coldErr.message)
        if (!isDup) return json({ error: `Cold-start queue insert failed: ${coldErr.message}` }, 500)
      }
      return json({ message: 'No eligible talents; flagged for cold start', matches_added: 0 })
    }
    return json({
      message: 'No eligible talents yet; auto-switch reached so cold-start is skipped',
      matches_added: 0,
      active_talents: n,
    })
  }

  const expiresAt = new Date(Date.now() + 5 * 86400000).toISOString()
  const applicationSummaries = await Promise.all(
    top.map((s) => generateApplicationSummary(role.title as string, roleTraits, s.aiSummary, s.mustHaveItems))
  )
  const toInsert = top.map((s, i) => ({
    role_id: body.role_id!,
    talent_id: s.talent_id,
    compatibility_score: Number(s.finalScore.toFixed(2)),
    tag_compatibility: Number(s.tagComp.toFixed(2)),
    culture_fit_score: Number(s.cultureFit.toFixed(2)),
    life_chart_score: s.characterScore == null ? null : Number(s.characterScore.toFixed(2)),
    internal_reasoning: s.reasoning,
    public_reasoning: buildPublicReasoning(s, roleTraits),
    application_summary: applicationSummaries[i],
    status: 'generated',
    expires_at: expiresAt,
    is_extra_match: isExtra,
  }))
  const { data: inserted, error: insErr } = await db.from('matches').insert(toInsert)
    .select('id, talent_id')
  if (insErr) return json({ error: insErr.message }, 500)

  await db.from('match_history').insert(
    (inserted ?? []).map((m) => ({
      role_id: body.role_id,
      talent_id: m.talent_id,
      action: 'generated',
    })),
  )

  const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  for (const s of top) {
    fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({
        user_id: s.profile_id,
        type: 'match_ready',
        data: { role_id: body.role_id, compatibility_score: s.finalScore },
      }),
    }).catch(() => { /* best effort */ })
  }

  return new Response(
    JSON.stringify({ message: 'OK', matches_added: inserted?.length ?? 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})

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
  finalScore: number
  ghostScore: number
  ghostThreshold: number
  cultureDataSource: string
  activeWindowBoth: boolean
  talentNeedsRamp: boolean
  mustHaveItems: string[]
  dealBreakerItems: string[]
  talentBehavioralTags: Record<string, number | null>
  reasoning: { talent_tag_overlap: Record<string, number>; weight_sum: number }
}

async function generateApplicationSummary(
  roleTitle: string,
  traits: string[],
  baseAiSummary: string | null,
  mustHaveItems: string[] = [],
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
  } catch { /* best effort — fall through */ }
  return baseAiSummary
}

function buildPublicReasoning(s: ScoredCandidate, roleTraits: string[]) {
  const overlap = s.reasoning.talent_tag_overlap ?? {}
  const matchedTraits = Object.keys(overlap)
  const missingTraits = roleTraits.filter((t) => !matchedTraits.includes(t))
  const strengths: string[] = []
  const watchouts: string[] = []

  if (matchedTraits.length > 0) {
    strengths.push(`Strong overlap on ${matchedTraits.length}/${roleTraits.length} required traits.`)
  }
  if (s.tagComp >= 70) strengths.push('Skills profile fits the role above the strong-match threshold.')
  else if (s.tagComp >= 40) watchouts.push('Skills overlap is moderate — interview should probe gaps.')
  else watchouts.push('Skills overlap is low — fit will rely on adjacent strengths.')

  if (s.cultureFit >= 60) strengths.push('Career preferences align well with what this team offers.')
  else if (s.cultureFit >= 30) watchouts.push('Some preference mismatches — discuss team culture fit in the interview.')
  else if (s.cultureFit > 0) watchouts.push("Career preferences may not fully match this role's environment.")

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

  if (s.backgroundScore < 50) {
    watchouts.push('Off-field background — interview should probe motivation and learning curve.')
  } else if (s.backgroundScore >= 100) {
    strengths.push('Background experience aligns with the role.')
  }

  // Fix f: surface ghost-score penalty when candidate has a pattern of slow/no responses.
  if (s.ghostScore >= s.ghostThreshold) {
    watchouts.push('This candidate has been slow to respond in previous matches — build extra lead time into your outreach and set a clear response deadline.')
  }

  // Fix c: flag that culture signals are AI-inferred from onboarding chat, not survey-verified.
  if (s.cultureDataSource === 'ai_inferred') {
    watchouts.push('Culture signals are self-reported via AI onboarding — treat as indicative, not verified. Confirm values and working style in the interview.')
  }

  // HR-facing nudges driven by internal signals. Wording is generic
  // professional advice — no reference to the underlying method.
  if (s.activeWindowBoth) {
    strengths.push('Strong-momentum match — recommend moving quickly while both sides are actively engaged.')
  }
  if (s.talentNeedsRamp) {
    watchouts.push('Likely growth hire — expect a 1–2 year ramp before full performance. Plan onboarding and mentorship accordingly.')
  }

  if (s.ageScore != null && s.ageScore < 50) {
    watchouts.push('Reporting-line age dynamic to consider.')
  }
  if (s.locationScore != null && s.locationScore < 40) {
    watchouts.push('Commute distance may be a factor — confirm during interview.')
  }
  if (missingTraits.length > 0) {
    watchouts.push(`Trait gaps to discuss: ${missingTraits.slice(0, 4).join(', ')}.`)
  }

  // Behavioural tag highlights — surface standout scores and red-flag lows.
  const bt = s.talentBehavioralTags ?? {}
  const BEHAVIORAL_LABELS: Record<string, string> = {
    ownership: 'personal accountability',
    communication_clarity: 'communication clarity',
    emotional_maturity: 'emotional maturity',
    problem_solving: 'problem-solving logic',
    resilience: 'resilience under failure',
    results_orientation: 'results orientation',
    professional_attitude: 'professional attitude',
    confidence: 'confident self-presentation',
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
  if (strongBehavior.length > 0) {
    strengths.push(`Behavioural interview signals strong ${strongBehavior.slice(0, 3).join(', ')}.`)
  }
  if (weakBehavior.length > 0) {
    watchouts.push(`Interview showed weak signals on: ${weakBehavior.slice(0, 3).join(', ')} — probe these.`)
  }

  // Must-have items the HM declared — flag for interview verification.
  if (s.mustHaveItems.length > 0) {
    watchouts.push(`Verify HM's non-negotiables in interview: ${s.mustHaveItems.slice(0, 3).join('; ')}.`)
  }

  // Talent's own deal-breakers — flag for HM awareness.
  if (s.dealBreakerItems.length > 0) {
    watchouts.push(`Talent's non-negotiables (must be honoured): ${s.dealBreakerItems.slice(0, 3).join('; ')}.`)
  }

  return {
    score_band: s.finalScore >= 75 ? 'strong' : s.finalScore >= 50 ? 'good' : 'cautious',
    strengths,
    watchouts,
    matched_traits: matchedTraits,
    missing_traits: missingTraits,
    behavioral_tags: bt,
    note: 'This explanation summarises platform signals. Final hiring decisions remain yours.',
  }
}
