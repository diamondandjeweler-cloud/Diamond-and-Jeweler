export type Role = 'talent' | 'hiring_manager' | 'hr_admin' | 'admin' | 'restaurant_staff'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: Role
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
  score_band: 'strong' | 'good' | 'cautious'
  strengths: string[]
  watchouts: string[]
  matched_traits: string[]
  missing_traits: string[]
  behavioral_tags?: Record<string, number | null>
  culture_comparison?: CultureComparison
  note?: string
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
