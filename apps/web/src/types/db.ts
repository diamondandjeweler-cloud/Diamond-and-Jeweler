// ---------------------------------------------------------------------------
// Role seam — keep the recruitment CORE decoupled from the Restaurant OS.
//
// `RecruitmentRole` is the set of roles the recruitment platform owns. Core
// code (matching, onboarding, dashboards) should reference THIS type so the
// restaurant module can be removed without touching it.
//
// `RestaurantRole` belongs to the flag-gated Restaurant OS (see App.tsx, the
// VITE_ENABLE_RESTAURANT seam). Restaurant code references `RestaurantRole` /
// `AppRole`.
//
// `AppRole` is the union actually stored in `profiles.role`, shared by code
// that has to handle either world (Profile, RoleGate).
//
// `Role` is retained as an alias of `AppRole` so existing imports keep working
// (e.g. components/RoleGate.tsx) without a cascade rename.
// ---------------------------------------------------------------------------
export type RecruitmentRole = 'talent' | 'hiring_manager' | 'hr_admin' | 'admin'
export type RestaurantRole = 'restaurant_staff'
export type AppRole = RecruitmentRole | RestaurantRole

/** @deprecated prefer RecruitmentRole (core) or AppRole (shared/restaurant). */
export type Role = AppRole

export interface Profile {
  id: string
  email: string
  full_name: string
  display_name: string | null
  phone: string | null
  role: AppRole
  consents: Record<string, unknown>
  is_banned: boolean
  ghost_score: number
  onboarding_complete: boolean
  waitlist_approved: boolean
  created_at: string
  updated_at: string

  // Phase 2 extensions
  consent_version: string | null
  consent_signed_at: string | null
  locale: 'en' | 'ms' | 'zh'
  whatsapp_number: string | null
  whatsapp_opt_in: boolean
  points: number
  points_earned_total: number
  referral_code: string | null
}

export interface Company {
  id: string
  name: string
  registration_number: string
  business_license_path: string | null
  website: string | null
  size: string | null
  industry: string | null
  primary_hr_email: string
  verified: boolean
  verified_at: string | null
  created_by: string
  created_at: string
}

// Lightweight company projection shared by the admin verification queue and the
// HM company-profile view. Promoted from two divergent inline copies — each view
// SELECTs a different column subset, so this is the UNION of both: only `name`
// (present in both projections) is required; every other field is optional so a
// narrower projection still satisfies the type. Distinct from `Company` (the
// full row) on purpose.
//   VerificationQueue projects: id, name, registration_number, primary_hr_email,
//                               business_license_path, created_at
//   HMCompanyProfile  projects: name, industry, size, website, verified
export interface CompanyRow {
  name: string
  id: string
  registration_number?: string
  primary_hr_email?: string
  business_license_path?: string | null
  created_at?: string
  industry?: string | null
  size?: string | null
  website?: string | null
  verified?: boolean
}

export interface HiringManager {
  id: string
  profile_id: string
  company_id: string
  job_title: string
  date_of_birth_encrypted: string | null
  gender: 'male' | 'female' | null
  life_chart_character: string | null
  leadership_answers: Record<string, string> | null
  leadership_tags: Record<string, number> | null
  created_at: string
}

export interface Talent {
  id: string
  profile_id: string
  date_of_birth_encrypted: string | null
  gender: 'male' | 'female' | null
  life_chart_character: string | null
  ic_path: string | null
  ic_verified: boolean
  resume_path: string | null
  parsed_resume: unknown
  privacy_mode: 'public' | 'anonymous' | 'whitelist'
  whitelist_companies: string[]
  expected_salary_min: number | null
  expected_salary_max: number | null
  is_open_to_offers: boolean
  interview_answers: Record<string, string> | null
  preference_ratings: Record<string, number> | null
  derived_tags: Record<string, number> | null
  created_at: string
  updated_at: string
}

export type MatchStatus =
  | 'generated' | 'viewed' | 'accepted_by_talent' | 'declined_by_talent'
  | 'invited_by_manager' | 'declined_by_manager' | 'hr_scheduling'
  | 'interview_scheduled' | 'interview_completed' | 'offer_made'
  | 'hired' | 'expired'

export interface Match {
  id: string
  role_id: string
  talent_id: string
  compatibility_score: number | null
  tag_compatibility: number | null
  life_chart_score: number | null
  status: MatchStatus
  viewed_at: string | null
  accepted_at: string | null
  invited_at: string | null
  expires_at: string | null
  refresh_count: number
  created_at: string
  updated_at: string
  public_reasoning?: PublicReasoning | null
}

export interface CultureComparison {
  talent_top_wants: string[]
  hm_top_offers: string[]
  overlap: string[]
  talent_only: string[]
  hm_only: string[]
  labels: Record<string, string>
}

export interface PublicReasoning {
  score_band?: 'strong' | 'good' | 'cautious'
  strengths: string[]
  watchouts: string[]
  matched_traits: string[]
  missing_traits: string[]
  behavioral_tags?: Record<string, number | null>
  culture_comparison?: CultureComparison
  note?: string
}

// Interview scheduling, shared by the HM and talent dashboards. The HM-only
// fields are OPTIONAL because the talent-facing queries intentionally omit them
// (hm_notes is private to the hiring manager; decline_reason likewise). Promoted
// from two divergent inline copies — keep this the single source of truth.
export interface InterviewRound {
  id: string
  round_number: number
  scheduled_at: string
  interview_url: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  hm_notes?: string | null
}

export interface InterviewProposal {
  id: string
  match_id: string
  round_number: number
  slot_1_at: string
  slot_2_at: string
  slot_3_at: string
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
  picked_slot: number | null
  decline_reason?: string | null
  created_at: string
}

// Role-row projection shared by the HM "My roles" list and the edit-role form.
// Promoted from two divergent inline copies — this is the UNION/superset so
// neither call site loses a field. The two views SELECT overlapping-but-distinct
// column subsets, so the EditRole-only columns (hiring_manager_id, description,
// from_onboarding) are optional here; every other field keeps the (required)
// shape MyRoles relied on, since MyRoles feeds them into required-typed props
// (e.g. ModerationBadge `status`, VacancyExpiry `expiresAt`). Both call sites
// build their rows by casting the untyped supabase response, so columns a query
// omits are tolerated at runtime regardless of optionality.
// Conflicting field types are reconciled to the NARROWER literal unions from
// EditRole (its <select> handlers cast to RoleRow['work_arrangement'] /
// RoleRow['experience_level']); those literals stay assignable to MyRoles'
// string-join usage, so no precision is lost.
export type RoleStatus = 'active' | 'paused' | 'filled' | 'expired'
export type ModerationStatus = 'pending' | 'approved' | 'flagged' | 'rejected'

export interface RoleRow {
  id: string
  title: string
  department: string | null
  location: string | null
  work_arrangement: 'remote' | 'hybrid' | 'onsite' | null
  experience_level: 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | null
  salary_min: number | null
  salary_max: number | null
  required_traits: string[]
  status: RoleStatus

  // EditRole-only (editable form) columns — absent from the MyRoles projection.
  hiring_manager_id?: string
  description?: string | null
  from_onboarding?: boolean

  // MyRoles list + moderation columns — absent from the EditRole projection.
  required_skills: string[] | null
  headcount: number | null
  min_education_level: string | null
  start_urgency: string | null
  open_to: string[] | null
  languages_required: Array<{ code: string; level: string }> | null
  created_at: string
  vacancy_expires_at: string | null
  moderation_status: ModerationStatus
  moderation_reason: string | null
  moderation_appealed_at: string | null
  moderation_reviewed_at: string | null
  match_count?: number
}

// Loose Database type for supabase-js generic. Generate via `supabase gen types`
// for strict typing once the project is live.
export type Database = {
  public: {
    Tables: Record<string, { Row: unknown; Insert: unknown; Update: unknown }>
    Views: Record<string, { Row: unknown }>
    Functions: Record<string, unknown>
    Enums: Record<string, string>
  }
}
