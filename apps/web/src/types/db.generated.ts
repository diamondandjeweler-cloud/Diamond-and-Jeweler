export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action_type: string
          admin_id: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_daily_snapshot: {
        Row: {
          active_roles: number
          created_at: string
          extra_match_purchases: number
          id: number
          matches_expired: number
          matches_generated: number
          matches_hired: number
          open_talents: number
          snapshot_date: string
          total_hm: number
          total_hr: number
          total_matches: number
          total_talents: number
          total_users: number
          urgent_priority_reqs: number
          verified_companies: number
        }
        Insert: {
          active_roles?: number
          created_at?: string
          extra_match_purchases?: number
          id?: number
          matches_expired?: number
          matches_generated?: number
          matches_hired?: number
          open_talents?: number
          snapshot_date: string
          total_hm?: number
          total_hr?: number
          total_matches?: number
          total_talents?: number
          total_users?: number
          urgent_priority_reqs?: number
          verified_companies?: number
        }
        Update: {
          active_roles?: number
          created_at?: string
          extra_match_purchases?: number
          id?: number
          matches_expired?: number
          matches_generated?: number
          matches_hired?: number
          open_talents?: number
          snapshot_date?: string
          total_hm?: number
          total_hr?: number
          total_matches?: number
          total_talents?: number
          total_users?: number
          urgent_priority_reqs?: number
          verified_companies?: number
        }
        Relationships: []
      }
      admin_kpi_cache: {
        Row: {
          active_roles: number
          active_talents: number
          banned_users: number
          companies_pending: number
          companies_verified: number
          ghost_users: number
          id: boolean
          refreshed_at: string
          total_users: number
          waitlist_pending: number
        }
        Insert: {
          active_roles?: number
          active_talents?: number
          banned_users?: number
          companies_pending?: number
          companies_verified?: number
          ghost_users?: number
          id?: boolean
          refreshed_at?: string
          total_users?: number
          waitlist_pending?: number
        }
        Update: {
          active_roles?: number
          active_talents?: number
          banned_users?: number
          companies_pending?: number
          companies_verified?: number
          ghost_users?: number
          id?: boolean
          refreshed_at?: string
          total_users?: number
          waitlist_pending?: number
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          endpoint: string
          id: string
          input_tokens: number | null
          mode: string | null
          model: string | null
          output_tokens: number | null
          provider: string | null
          role: string
          user_id: string
          user_role: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          endpoint: string
          id?: string
          input_tokens?: number | null
          mode?: string | null
          model?: string | null
          output_tokens?: number | null
          provider?: string | null
          role: string
          user_id: string
          user_role?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          input_tokens?: number | null
          mode?: string | null
          model?: string | null
          output_tokens?: number | null
          provider?: string | null
          role?: string
          user_id?: string
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          id: number
          ip_hash: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          subject_id: string | null
          ua_hash: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: number
          ip_hash?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          subject_id?: string | null
          ua_hash?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: number
          ip_hash?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          subject_id?: string | null
          ua_hash?: string | null
        }
        Relationships: []
      }
      auth_events: {
        Row: {
          created_at: string
          email_domain: string | null
          event_type: string
          id: string
          ip_hash: string | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email_domain?: string | null
          event_type: string
          id?: string
          ip_hash?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email_domain?: string | null
          event_type?: string
          id?: string
          ip_hash?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      chat_rate_limits: {
        Row: {
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_start_queue: {
        Row: {
          created_at: string
          id: string
          role_id: string
          status: string
          talent_ids: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          status?: string
          talent_ids?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          status?: string
          talent_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cold_start_queue_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_start_queue_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_stale_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      companies: {
        Row: {
          business_license_path: string | null
          created_at: string
          created_by: string
          id: string
          industry: string | null
          name: string
          primary_hr_email: string
          registration_number: string
          size: string | null
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
          website: string | null
        }
        Insert: {
          business_license_path?: string | null
          created_at?: string
          created_by: string
          id?: string
          industry?: string | null
          name: string
          primary_hr_email: string
          registration_number: string
          size?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Update: {
          business_license_path?: string | null
          created_at?: string
          created_by?: string
          id?: string
          industry?: string | null
          name?: string
          primary_hr_email?: string
          registration_number?: string
          size?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_hm_link_requests: {
        Row: {
          company_id: string
          created_at: string
          hm_id: string
          id: string
          requested_by: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          hm_id: string
          id?: string
          requested_by: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          hm_id?: string
          id?: string
          requested_by?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_hm_link_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_hm_link_requests_hm_id_fkey"
            columns: ["hm_id"]
            isOneToOne: false
            referencedRelation: "hiring_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_hm_link_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_versions: {
        Row: {
          body_md: string
          created_at: string
          id: string
          is_active: boolean
          language: string
          version: string
        }
        Insert: {
          body_md: string
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          version: string
        }
        Update: {
          body_md?: string
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          version?: string
        }
        Relationships: []
      }
      consult_bookings: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          paid_at: string | null
          payment_provider: string
          payment_redirect_url: string | null
          payment_ref: string | null
          price_rm: number
          profile_id: string
          scheduled_for: string | null
          status: string
          tier: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          id?: string
          paid_at?: string | null
          payment_provider?: string
          payment_redirect_url?: string | null
          payment_ref?: string | null
          price_rm: number
          profile_id: string
          scheduled_for?: string | null
          status?: string
          tier: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          paid_at?: string | null
          payment_provider?: string
          payment_redirect_url?: string | null
          payment_ref?: string | null
          price_rm?: number
          profile_id?: string
          scheduled_for?: string | null
          status?: string
          tier?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consult_bookings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_heartbeat: {
        Row: {
          job_name: string
          last_run_at: string
          note: string | null
        }
        Insert: {
          job_name: string
          last_run_at?: string
          note?: string | null
        }
        Update: {
          job_name?: string
          last_run_at?: string
          note?: string | null
        }
        Relationships: []
      }
      data_requests: {
        Row: {
          correction_proposal: Json | null
          created_at: string
          id: string
          notes: string | null
          request_type: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          correction_proposal?: Json | null
          created_at?: string
          id?: string
          notes?: string | null
          request_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          correction_proposal?: Json | null
          created_at?: string
          id?: string
          notes?: string | null
          request_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_log: {
        Row: {
          action: string
          details: Json | null
          id: string
          occurred_at: string
          profile_id: string
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          occurred_at?: string
          profile_id: string
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          occurred_at?: string
          profile_id?: string
        }
        Relationships: []
      }
      extra_match_purchases: {
        Row: {
          amount_rm: number
          created_at: string
          currency: string
          id: string
          match_type: string
          paid_at: string | null
          payment_intent_id: string | null
          payment_provider: string
          payment_status: string
          quantity: number
          refund_reason: string | null
          refunded_at: string | null
          refunded_by: string | null
          role_id: string | null
          talent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_rm?: number
          created_at?: string
          currency?: string
          id?: string
          match_type: string
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_provider?: string
          payment_status?: string
          quantity?: number
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          role_id?: string | null
          talent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_rm?: number
          created_at?: string
          currency?: string
          id?: string
          match_type?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_provider?: string
          payment_status?: string
          quantity?: number
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          role_id?: string | null
          talent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_match_purchases_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_match_purchases_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_match_purchases_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_stale_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "extra_match_purchases_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_match_purchases_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "v_stale_talents"
            referencedColumns: ["talent_id"]
          },
          {
            foreignKeyName: "extra_match_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_submissions: {
        Row: {
          comment: string | null
          created_at: string
          from_user_id: string
          id: string
          match_id: string
          rating: number
          to_user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          from_user_id: string
          id?: string
          match_id: string
          rating: number
          to_user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          from_user_id?: string
          id?: string
          match_id?: string
          rating?: number
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_submissions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_managers: {
        Row: {
          ai_summary: string | null
          budget_approved: string | null
          career_growth_potential: string | null
          company_id: string | null
          created_at: string
          cultural_alignment_tags: Json | null
          culture_data_source: string
          culture_offers: Json | null
          date_of_birth_encrypted: string | null
          deadline_to_fill: string | null
          deleted_at: string | null
          failure_at_90_days: string | null
          feedback_tags: Json | null
          feedback_volume: number
          gender: string | null
          hardest_part_of_role: string | null
          hire_urgency: string | null
          hm_cancel_rate: number | null
          hm_offer_rate: number | null
          hm_quality_factor: number | null
          id: string
          industry: string | null
          interview_answers: Json | null
          interview_stages: number | null
          job_title: string
          languages: string[] | null
          leadership_answers: Json | null
          leadership_tags: Json | null
          life_chart_character: string | null
          location_matters: boolean | null
          location_postcode: string | null
          must_have_items: string[] | null
          must_haves: Json | null
          panel_involved: boolean | null
          phs_offer_accept_rate: number | null
          phs_retention_rate: number | null
          phs_truthfulness_score: number | null
          profile_id: string
          race: string | null
          religion: string | null
          reputation_score: number | null
          required_traits: string[] | null
          required_work_authorization: string[] | null
          role_constraints: Json | null
          role_open_reason: string | null
          role_type: string | null
          salary_flex: boolean | null
          salary_offer_max: number | null
          salary_offer_min: number | null
          screening_red_flags: string[] | null
          success_at_90_days: string | null
          team_size: number | null
          why_last_hire_left: string | null
          work_arrangement_offered: string | null
        }
        Insert: {
          ai_summary?: string | null
          budget_approved?: string | null
          career_growth_potential?: string | null
          company_id?: string | null
          created_at?: string
          cultural_alignment_tags?: Json | null
          culture_data_source?: string
          culture_offers?: Json | null
          date_of_birth_encrypted?: string | null
          deadline_to_fill?: string | null
          deleted_at?: string | null
          failure_at_90_days?: string | null
          feedback_tags?: Json | null
          feedback_volume?: number
          gender?: string | null
          hardest_part_of_role?: string | null
          hire_urgency?: string | null
          hm_cancel_rate?: number | null
          hm_offer_rate?: number | null
          hm_quality_factor?: number | null
          id?: string
          industry?: string | null
          interview_answers?: Json | null
          interview_stages?: number | null
          job_title: string
          languages?: string[] | null
          leadership_answers?: Json | null
          leadership_tags?: Json | null
          life_chart_character?: string | null
          location_matters?: boolean | null
          location_postcode?: string | null
          must_have_items?: string[] | null
          must_haves?: Json | null
          panel_involved?: boolean | null
          phs_offer_accept_rate?: number | null
          phs_retention_rate?: number | null
          phs_truthfulness_score?: number | null
          profile_id: string
          race?: string | null
          religion?: string | null
          reputation_score?: number | null
          required_traits?: string[] | null
          required_work_authorization?: string[] | null
          role_constraints?: Json | null
          role_open_reason?: string | null
          role_type?: string | null
          salary_flex?: boolean | null
          salary_offer_max?: number | null
          salary_offer_min?: number | null
          screening_red_flags?: string[] | null
          success_at_90_days?: string | null
          team_size?: number | null
          why_last_hire_left?: string | null
          work_arrangement_offered?: string | null
        }
        Update: {
          ai_summary?: string | null
          budget_approved?: string | null
          career_growth_potential?: string | null
          company_id?: string | null
          created_at?: string
          cultural_alignment_tags?: Json | null
          culture_data_source?: string
          culture_offers?: Json | null
          date_of_birth_encrypted?: string | null
          deadline_to_fill?: string | null
          deleted_at?: string | null
          failure_at_90_days?: string | null
          feedback_tags?: Json | null
          feedback_volume?: number
          gender?: string | null
          hardest_part_of_role?: string | null
          hire_urgency?: string | null
          hm_cancel_rate?: number | null
          hm_offer_rate?: number | null
          hm_quality_factor?: number | null
          id?: string
          industry?: string | null
          interview_answers?: Json | null
          interview_stages?: number | null
          job_title?: string
          languages?: string[] | null
          leadership_answers?: Json | null
          leadership_tags?: Json | null
          life_chart_character?: string | null
          location_matters?: boolean | null
          location_postcode?: string | null
          must_have_items?: string[] | null
          must_haves?: Json | null
          panel_involved?: boolean | null
          phs_offer_accept_rate?: number | null
          phs_retention_rate?: number | null
          phs_truthfulness_score?: number | null
          profile_id?: string
          race?: string | null
          religion?: string | null
          reputation_score?: number | null
          required_traits?: string[] | null
          required_work_authorization?: string[] | null
          role_constraints?: Json | null
          role_open_reason?: string | null
          role_type?: string | null
          salary_flex?: boolean | null
          salary_offer_max?: number | null
          salary_offer_min?: number | null
          screening_red_flags?: string[] | null
          success_at_90_days?: string | null
          team_size?: number | null
          why_last_hire_left?: string | null
          work_arrangement_offered?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hiring_managers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_managers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_synonyms: {
        Row: {
          alias: string
          canonical: string
        }
        Insert: {
          alias: string
          canonical: string
        }
        Update: {
          alias?: string
          canonical?: string
        }
        Relationships: []
      }
      interview_proposals: {
        Row: {
          created_at: string
          decline_reason: string | null
          id: string
          match_id: string
          picked_at: string | null
          picked_slot: number | null
          resulting_round_id: string | null
          round_number: number
          slot_1_at: string
          slot_2_at: string
          slot_3_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          id?: string
          match_id: string
          picked_at?: string | null
          picked_slot?: number | null
          resulting_round_id?: string | null
          round_number: number
          slot_1_at: string
          slot_2_at: string
          slot_3_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          id?: string
          match_id?: string
          picked_at?: string | null
          picked_slot?: number | null
          resulting_round_id?: string | null
          round_number?: number
          slot_1_at?: string
          slot_2_at?: string
          slot_3_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_proposals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_proposals_resulting_round_id_fkey"
            columns: ["resulting_round_id"]
            isOneToOne: false
            referencedRelation: "interview_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_rounds: {
        Row: {
          created_at: string
          hm_notes: string | null
          id: string
          interview_token: string
          interview_url: string
          match_id: string
          round_number: number
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hm_notes?: string | null
          id?: string
          interview_token?: string
          interview_url: string
          match_id: string
          round_number?: number
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hm_notes?: string | null
          id?: string
          interview_token?: string
          interview_url?: string
          match_id?: string
          round_number?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_rounds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          created_at: string
          feedback_manager: number | null
          feedback_talent: number | null
          format: string | null
          id: string
          match_id: string
          meeting_provider: string | null
          meeting_room_name: string | null
          meeting_url: string | null
          notes: string | null
          scheduled_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          feedback_manager?: number | null
          feedback_talent?: number | null
          format?: string | null
          id?: string
          match_id: string
          meeting_provider?: string | null
          meeting_room_name?: string | null
          meeting_url?: string | null
          notes?: string | null
          scheduled_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          feedback_manager?: number | null
          feedback_talent?: number | null
          format?: string | null
          id?: string
          match_id?: string
          meeting_provider?: string | null
          meeting_room_name?: string | null
          meeting_url?: string | null
          notes?: string | null
          scheduled_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      job_posting_drafts: {
        Row: {
          draft_data: Json
          hm_id: string
          id: string
          updated_at: string
        }
        Insert: {
          draft_data?: Json
          hm_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          draft_data?: Json
          hm_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_posting_drafts_hm_id_fkey"
            columns: ["hm_id"]
            isOneToOne: true
            referencedRelation: "hiring_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      life_chart_adjustments: {
        Row: {
          adjustment: number
          created_at: string
          day_from: number | null
          day_to: number | null
          description: string | null
          gender: string | null
          id: string
          month: number | null
        }
        Insert: {
          adjustment: number
          created_at?: string
          day_from?: number | null
          day_to?: number | null
          description?: string | null
          gender?: string | null
          id?: string
          month?: number | null
        }
        Update: {
          adjustment?: number
          created_at?: string
          day_from?: number | null
          day_to?: number | null
          description?: string | null
          gender?: string | null
          id?: string
          month?: number | null
        }
        Relationships: []
      }
      life_chart_base: {
        Row: {
          base_number: number
          created_at: string
          end_date: string
          gender: string | null
          id: string
          start_date: string
        }
        Insert: {
          base_number: number
          created_at?: string
          end_date: string
          gender?: string | null
          id?: string
          start_date: string
        }
        Update: {
          base_number?: number
          created_at?: string
          end_date?: string
          gender?: string | null
          id?: string
          start_date?: string
        }
        Relationships: []
      }
      life_chart_cache: {
        Row: {
          computed_at: string
          dob1: string
          dob2: string
          id: string
          score: number
        }
        Insert: {
          computed_at?: string
          dob1: string
          dob2: string
          id?: string
          score: number
        }
        Update: {
          computed_at?: string
          dob1?: string
          dob2?: string
          id?: string
          score?: number
        }
        Relationships: []
      }
      life_chart_compatibility: {
        Row: {
          bucket: string
          hm_character: string
          talent_character: string
        }
        Insert: {
          bucket: string
          hm_character: string
          talent_character: string
        }
        Update: {
          bucket?: string
          hm_character?: string
          talent_character?: string
        }
        Relationships: []
      }
      life_chart_yearly_fortune: {
        Row: {
          computed_at: string
          fortune_score: number
          fortune_summary: string | null
          fortune_year: number
          profile_id: string
        }
        Insert: {
          computed_at?: string
          fortune_score: number
          fortune_summary?: string | null
          fortune_year: number
          profile_id: string
        }
        Update: {
          computed_at?: string
          fortune_score?: number
          fortune_summary?: string | null
          fortune_year?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_chart_yearly_fortune_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          email_hash: string
          id: string
          succeeded: boolean | null
        }
        Insert: {
          attempted_at?: string
          email_hash: string
          id?: string
          succeeded?: boolean | null
        }
        Update: {
          attempted_at?: string
          email_hash?: string
          id?: string
          succeeded?: boolean | null
        }
        Relationships: []
      }
      market_rate_cache: {
        Row: {
          currency: string
          experience_level: string | null
          id: string
          job_title: string
          location: string | null
          max_salary: number | null
          median_salary: number | null
          min_salary: number | null
          snapshot_date: string
        }
        Insert: {
          currency?: string
          experience_level?: string | null
          id?: string
          job_title: string
          location?: string | null
          max_salary?: number | null
          median_salary?: number | null
          min_salary?: number | null
          snapshot_date?: string
        }
        Update: {
          currency?: string
          experience_level?: string | null
          id?: string
          job_title?: string
          location?: string | null
          max_salary?: number | null
          median_salary?: number | null
          min_salary?: number | null
          snapshot_date?: string
        }
        Relationships: []
      }
      match_feedback: {
        Row: {
          created_at: string
          diamond_points_awarded: number
          feedback_tags: Json | null
          free_text: string | null
          hired: boolean
          id: string
          match_id: string
          notes: string | null
          outcome: string | null
          rating: number
        }
        Insert: {
          created_at?: string
          diamond_points_awarded?: number
          feedback_tags?: Json | null
          free_text?: string | null
          hired?: boolean
          id?: string
          match_id: string
          notes?: string | null
          outcome?: string | null
          rating: number
        }
        Update: {
          created_at?: string
          diamond_points_awarded?: number
          feedback_tags?: Json | null
          free_text?: string | null
          hired?: boolean
          id?: string
          match_id?: string
          notes?: string | null
          outcome?: string | null
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_feedback_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_feedback_events: {
        Row: {
          created_at: string
          diamond_points_awarded: number
          feedback_tags: Json | null
          free_text: string | null
          from_party: string
          id: string
          match_id: string
          outcome: string | null
          rating: number | null
          stage: string
        }
        Insert: {
          created_at?: string
          diamond_points_awarded?: number
          feedback_tags?: Json | null
          free_text?: string | null
          from_party: string
          id?: string
          match_id: string
          outcome?: string | null
          rating?: number | null
          stage: string
        }
        Update: {
          created_at?: string
          diamond_points_awarded?: number
          feedback_tags?: Json | null
          free_text?: string | null
          from_party?: string
          id?: string
          match_id?: string
          outcome?: string | null
          rating?: number | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_feedback_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_history: {
        Row: {
          action: string
          created_at: string
          id: string
          previous_match_id: string | null
          role_id: string | null
          talent_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          previous_match_id?: string | null
          role_id?: string | null
          talent_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          previous_match_id?: string | null
          role_id?: string | null
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_history_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_history_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_stale_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "match_history_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_history_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "v_stale_talents"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      match_lifecycle: {
        Row: {
          hired_at: string | null
          interview_completed_at: string | null
          match_id: string
          offer_made_at: string | null
          one_year_review_due_at: string | null
          probation_failed_at: string | null
          probation_passed_at: string | null
          separation_at: string | null
          separation_reason: string | null
          six_month_review_due_at: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          hired_at?: string | null
          interview_completed_at?: string | null
          match_id: string
          offer_made_at?: string | null
          one_year_review_due_at?: string | null
          probation_failed_at?: string | null
          probation_passed_at?: string | null
          separation_at?: string | null
          separation_reason?: string | null
          six_month_review_due_at?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          hired_at?: string | null
          interview_completed_at?: string | null
          match_id?: string
          offer_made_at?: string | null
          one_year_review_due_at?: string | null
          probation_failed_at?: string | null
          probation_passed_at?: string | null
          separation_at?: string | null
          separation_reason?: string | null
          six_month_review_due_at?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_lifecycle_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_outcomes: {
        Row: {
          id: string
          match_id: string
          outcome: string
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          id?: string
          match_id: string
          outcome: string
          recorded_at?: string
          recorded_by?: string
        }
        Update: {
          id?: string
          match_id?: string
          outcome?: string
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_outcomes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_queue: {
        Row: {
          created_at: string
          id: number
          last_error: string | null
          priority: number
          processed_at: string | null
          retry_count: number
          role_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          last_error?: string | null
          priority?: number
          processed_at?: string | null
          retry_count?: number
          role_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          last_error?: string | null
          priority?: number
          processed_at?: string | null
          retry_count?: number
          role_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_queue_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_queue_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_stale_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      matches: {
        Row: {
          accepted_at: string | null
          application_summary: string | null
          compatibility_score: number | null
          created_at: string
          culture_fit_score: number | null
          expires_at: string | null
          expiry_warning_sent_at: string | null
          force_match_reason: string | null
          force_matched_by: string | null
          id: string
          internal_reasoning: Json | null
          interview_completed_at: string | null
          invited_at: string | null
          is_extra_match: boolean
          is_force_match: boolean
          is_urgent: boolean
          life_chart_score: number | null
          offer_made_at: string | null
          public_reasoning: Json | null
          refresh_count: number
          reminder_48h_sent_at: string | null
          role_id: string
          status: string
          tag_compatibility: number | null
          talent_id: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          application_summary?: string | null
          compatibility_score?: number | null
          created_at?: string
          culture_fit_score?: number | null
          expires_at?: string | null
          expiry_warning_sent_at?: string | null
          force_match_reason?: string | null
          force_matched_by?: string | null
          id?: string
          internal_reasoning?: Json | null
          interview_completed_at?: string | null
          invited_at?: string | null
          is_extra_match?: boolean
          is_force_match?: boolean
          is_urgent?: boolean
          life_chart_score?: number | null
          offer_made_at?: string | null
          public_reasoning?: Json | null
          refresh_count?: number
          reminder_48h_sent_at?: string | null
          role_id: string
          status?: string
          tag_compatibility?: number | null
          talent_id: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          application_summary?: string | null
          compatibility_score?: number | null
          created_at?: string
          culture_fit_score?: number | null
          expires_at?: string | null
          expiry_warning_sent_at?: string | null
          force_match_reason?: string | null
          force_matched_by?: string | null
          id?: string
          internal_reasoning?: Json | null
          interview_completed_at?: string | null
          invited_at?: string | null
          is_extra_match?: boolean
          is_force_match?: boolean
          is_urgent?: boolean
          life_chart_score?: number | null
          offer_made_at?: string | null
          public_reasoning?: Json | null
          refresh_count?: number
          reminder_48h_sent_at?: string | null
          role_id?: string
          status?: string
          tag_compatibility?: number | null
          talent_id?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_force_matched_by_fkey"
            columns: ["force_matched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_stale_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "matches_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "v_stale_talents"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      monthly_character_boost: {
        Row: {
          characters_encrypted: string
          month: string
          submitted_at: string
          submitted_by: string | null
        }
        Insert: {
          characters_encrypted: string
          month: string
          submitted_at?: string
          submitted_by?: string | null
        }
        Update: {
          characters_encrypted?: string
          month?: string
          submitted_at?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_character_boost_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nn_atom_embeddings: {
        Row: {
          atom_index: number
          created_at: string
          dim: number
          embedding: string | null
          id: number
          owner_id: string
          owner_type: string
          provider: string
          text: string
        }
        Insert: {
          atom_index: number
          created_at?: string
          dim?: number
          embedding?: string | null
          id?: number
          owner_id: string
          owner_type: string
          provider?: string
          text: string
        }
        Update: {
          atom_index?: number
          created_at?: string
          dim?: number
          embedding?: string | null
          id?: number
          owner_id?: string
          owner_type?: string
          provider?: string
          text?: string
        }
        Relationships: []
      }
      notification_outbox: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          notify_type: string
          payload: Json
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          notify_type: string
          payload?: Json
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          notify_type?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          channel: string | null
          data: Json | null
          id: string
          read: boolean
          sent_at: string
          subject: string | null
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: string | null
          data?: Json | null
          id?: string
          read?: boolean
          sent_at?: string
          subject?: string | null
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: string | null
          data?: Json | null
          id?: string
          read?: boolean
          sent_at?: string
          subject?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nudge_history: {
        Row: {
          channel: string
          created_at: string
          id: string
          nudge_type: string
          outbox_id: string | null
          payload_summary: Json
          sent_at: string
          snoozed_until: string | null
          talent_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          nudge_type: string
          outbox_id?: string | null
          payload_summary?: Json
          sent_at?: string
          snoozed_until?: string | null
          talent_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          nudge_type?: string
          outbox_id?: string | null
          payload_summary?: Json
          sent_at?: string
          snoozed_until?: string | null
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudge_history_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "notification_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nudge_history_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nudge_history_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "v_stale_talents"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      org_consultations: {
        Row: {
          analysis: Json | null
          client_company: string
          client_contact_email: string | null
          client_contact_name: string | null
          client_contact_phone: string | null
          client_industry: string | null
          consultant_id: number | null
          consultant_notes: string | null
          created_at: string | null
          created_by: number | null
          delivered_at: string | null
          id: number
          members: Json | null
          pairs: Json | null
          payment_method: string | null
          payment_received_at: string | null
          payment_reference: string | null
          payment_status: string | null
          price_myr: number
          report_generated_at: string | null
          report_html: string | null
          status: string | null
          team_size: number
          tier_code: string
          updated_at: string | null
        }
        Insert: {
          analysis?: Json | null
          client_company: string
          client_contact_email?: string | null
          client_contact_name?: string | null
          client_contact_phone?: string | null
          client_industry?: string | null
          consultant_id?: number | null
          consultant_notes?: string | null
          created_at?: string | null
          created_by?: number | null
          delivered_at?: string | null
          id?: number
          members?: Json | null
          pairs?: Json | null
          payment_method?: string | null
          payment_received_at?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          price_myr: number
          report_generated_at?: string | null
          report_html?: string | null
          status?: string | null
          team_size: number
          tier_code: string
          updated_at?: string | null
        }
        Update: {
          analysis?: Json | null
          client_company?: string
          client_contact_email?: string | null
          client_contact_name?: string | null
          client_contact_phone?: string | null
          client_industry?: string | null
          consultant_id?: number | null
          consultant_notes?: string | null
          created_at?: string | null
          created_by?: number | null
          delivered_at?: string | null
          id?: number
          members?: Json | null
          pairs?: Json | null
          payment_method?: string | null
          payment_received_at?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          price_myr?: number
          report_generated_at?: string | null
          report_html?: string | null
          status?: string | null
          team_size?: number
          tier_code?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      point_purchases: {
        Row: {
          amount_rm: number
          created_at: string
          currency: string
          id: string
          package_id: string
          package_name: string
          paid_at: string | null
          payment_intent_id: string | null
          payment_provider: string
          payment_status: string
          points: number
          refund_reason: string | null
          refunded_at: string | null
          refunded_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_rm: number
          created_at?: string
          currency?: string
          id?: string
          package_id: string
          package_name: string
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_provider?: string
          payment_status?: string
          points: number
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_rm?: number
          created_at?: string
          currency?: string
          id?: string
          package_id?: string
          package_name?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_provider?: string
          payment_status?: string
          points?: number
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_purchases_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          idempotency_key: string | null
          reason: string
          reference: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          idempotency_key?: string | null
          reason: string
          reference?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          idempotency_key?: string | null
          reason?: string
          reference?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      proactive_nudge_config: {
        Row: {
          age_cutoff: number
          age_ramp_years: number
          age_weight_floor: number
          cooldown_days: number
          enabled: boolean
          max_jobs_per_nudge: number
          notes: string | null
          region_code: string
          score_threshold: number
          updated_at: string
        }
        Insert: {
          age_cutoff?: number
          age_ramp_years?: number
          age_weight_floor?: number
          cooldown_days?: number
          enabled?: boolean
          max_jobs_per_nudge?: number
          notes?: string | null
          region_code: string
          score_threshold?: number
          updated_at?: string
        }
        Update: {
          age_cutoff?: number
          age_ramp_years?: number
          age_weight_floor?: number
          cooldown_days?: number
          enabled?: boolean
          max_jobs_per_nudge?: number
          notes?: string | null
          region_code?: string
          score_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          consent_ip_hash: string | null
          consent_signed_at: string | null
          consent_version: string | null
          consents: Json
          created_at: string
          deleted_at: string | null
          diamond_points: number
          display_name: string | null
          email: string
          email_bounced: boolean
          full_name: string
          ghost_score: number
          id: string
          interview_transcript: Json | null
          is_banned: boolean
          locale: string
          onboarding_complete: boolean
          onboarding_reminder_count: number
          onboarding_reminder_sent_at: string | null
          phone: string | null
          points: number
          points_earned_total: number
          referral_code: string | null
          role: string
          updated_at: string
          waitlist_approved: boolean
          whatsapp_number: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          consent_ip_hash?: string | null
          consent_signed_at?: string | null
          consent_version?: string | null
          consents?: Json
          created_at?: string
          deleted_at?: string | null
          diamond_points?: number
          display_name?: string | null
          email: string
          email_bounced?: boolean
          full_name: string
          ghost_score?: number
          id: string
          interview_transcript?: Json | null
          is_banned?: boolean
          locale?: string
          onboarding_complete?: boolean
          onboarding_reminder_count?: number
          onboarding_reminder_sent_at?: string | null
          phone?: string | null
          points?: number
          points_earned_total?: number
          referral_code?: string | null
          role?: string
          updated_at?: string
          waitlist_approved?: boolean
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          consent_ip_hash?: string | null
          consent_signed_at?: string | null
          consent_version?: string | null
          consents?: Json
          created_at?: string
          deleted_at?: string | null
          diamond_points?: number
          display_name?: string | null
          email?: string
          email_bounced?: boolean
          full_name?: string
          ghost_score?: number
          id?: string
          interview_transcript?: Json | null
          is_banned?: boolean
          locale?: string
          onboarding_complete?: boolean
          onboarding_reminder_count?: number
          onboarding_reminder_sent_at?: string | null
          phone?: string | null
          points?: number
          points_earned_total?: number
          referral_code?: string | null
          role?: string
          updated_at?: string
          waitlist_approved?: boolean
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          subscription: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          subscription: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          subscription?: Json
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          referred_email: string
          referred_user_id: string | null
          referrer_id: string
          reward_claimed_at: string | null
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referred_email: string
          referred_user_id?: string | null
          referrer_id: string
          reward_claimed_at?: string | null
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referred_email?: string
          referred_user_id?: string | null
          referrer_id?: string
          reward_claimed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      request_dedup: {
        Row: {
          created_at: string
          endpoint: string | null
          expires_at: string
          key: string
          response: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          expires_at?: string
          key: string
          response?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          expires_at?: string
          key?: string
          response?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      role_moderation_events: {
        Row: {
          actor_id: string | null
          category: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          new_status: string | null
          prev_status: string | null
          provider: string | null
          reason: string | null
          role_id: string
          score: number | null
        }
        Insert: {
          actor_id?: string | null
          category?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          new_status?: string | null
          prev_status?: string | null
          provider?: string | null
          reason?: string | null
          role_id: string
          score?: number | null
        }
        Update: {
          actor_id?: string | null
          category?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          prev_status?: string | null
          provider?: string | null
          reason?: string | null
          role_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "role_moderation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_moderation_events_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_moderation_events_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_stale_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      roles: {
        Row: {
          accept_no_experience: boolean
          created_at: string
          days_per_week: number | null
          department: string | null
          description: string | null
          direct_team_size: number | null
          duration_days: number | null
          eligibility_work_auth: string[]
          employment_type: string
          environment_flags: string[]
          experience_level: string | null
          extra_matches_used: number
          from_onboarding: boolean
          has_night_shifts: boolean
          headcount: number
          hiring_manager_id: string
          hourly_rate: number | null
          id: string
          industry: string | null
          interview_process: string | null
          is_commission_based: boolean
          languages_required: Json
          location: string | null
          location_postcode: string | null
          market_rate_check: Json | null
          min_education_class: string | null
          min_education_level: string | null
          moderation_appeal_text: string | null
          moderation_appealed_at: string | null
          moderation_attempts: number
          moderation_category: string | null
          moderation_checked_at: string | null
          moderation_provider: string | null
          moderation_reason: string | null
          moderation_reviewed_at: string | null
          moderation_reviewed_by: string | null
          moderation_score: number | null
          moderation_status: string
          non_negotiables_atoms: Json
          non_negotiables_text: string | null
          off_day_pattern: string | null
          open_to: string[]
          preferred_skills: string[]
          probation_months: number | null
          reports_to_title: string | null
          required_skills: string[]
          required_traits: string[]
          requires_driving_license: boolean
          requires_overtime: boolean
          requires_own_car: boolean
          requires_relocation: boolean
          requires_travel: boolean
          requires_weekend: boolean
          salary_max: number | null
          salary_min: number | null
          schedule_end_time: string | null
          schedule_start_time: string | null
          shift_type: string | null
          start_date: string | null
          start_urgency: string | null
          status: string
          team_member_characters: string[] | null
          team_member_inputs: Json | null
          title: string
          updated_at: string
          vacancy_expires_at: string
          weight_preset: string | null
          work_arrangement: string | null
        }
        Insert: {
          accept_no_experience?: boolean
          created_at?: string
          days_per_week?: number | null
          department?: string | null
          description?: string | null
          direct_team_size?: number | null
          duration_days?: number | null
          eligibility_work_auth?: string[]
          employment_type?: string
          environment_flags?: string[]
          experience_level?: string | null
          extra_matches_used?: number
          from_onboarding?: boolean
          has_night_shifts?: boolean
          headcount?: number
          hiring_manager_id: string
          hourly_rate?: number | null
          id?: string
          industry?: string | null
          interview_process?: string | null
          is_commission_based?: boolean
          languages_required?: Json
          location?: string | null
          location_postcode?: string | null
          market_rate_check?: Json | null
          min_education_class?: string | null
          min_education_level?: string | null
          moderation_appeal_text?: string | null
          moderation_appealed_at?: string | null
          moderation_attempts?: number
          moderation_category?: string | null
          moderation_checked_at?: string | null
          moderation_provider?: string | null
          moderation_reason?: string | null
          moderation_reviewed_at?: string | null
          moderation_reviewed_by?: string | null
          moderation_score?: number | null
          moderation_status?: string
          non_negotiables_atoms?: Json
          non_negotiables_text?: string | null
          off_day_pattern?: string | null
          open_to?: string[]
          preferred_skills?: string[]
          probation_months?: number | null
          reports_to_title?: string | null
          required_skills?: string[]
          required_traits?: string[]
          requires_driving_license?: boolean
          requires_overtime?: boolean
          requires_own_car?: boolean
          requires_relocation?: boolean
          requires_travel?: boolean
          requires_weekend?: boolean
          salary_max?: number | null
          salary_min?: number | null
          schedule_end_time?: string | null
          schedule_start_time?: string | null
          shift_type?: string | null
          start_date?: string | null
          start_urgency?: string | null
          status?: string
          team_member_characters?: string[] | null
          team_member_inputs?: Json | null
          title: string
          updated_at?: string
          vacancy_expires_at?: string
          weight_preset?: string | null
          work_arrangement?: string | null
        }
        Update: {
          accept_no_experience?: boolean
          created_at?: string
          days_per_week?: number | null
          department?: string | null
          description?: string | null
          direct_team_size?: number | null
          duration_days?: number | null
          eligibility_work_auth?: string[]
          employment_type?: string
          environment_flags?: string[]
          experience_level?: string | null
          extra_matches_used?: number
          from_onboarding?: boolean
          has_night_shifts?: boolean
          headcount?: number
          hiring_manager_id?: string
          hourly_rate?: number | null
          id?: string
          industry?: string | null
          interview_process?: string | null
          is_commission_based?: boolean
          languages_required?: Json
          location?: string | null
          location_postcode?: string | null
          market_rate_check?: Json | null
          min_education_class?: string | null
          min_education_level?: string | null
          moderation_appeal_text?: string | null
          moderation_appealed_at?: string | null
          moderation_attempts?: number
          moderation_category?: string | null
          moderation_checked_at?: string | null
          moderation_provider?: string | null
          moderation_reason?: string | null
          moderation_reviewed_at?: string | null
          moderation_reviewed_by?: string | null
          moderation_score?: number | null
          moderation_status?: string
          non_negotiables_atoms?: Json
          non_negotiables_text?: string | null
          off_day_pattern?: string | null
          open_to?: string[]
          preferred_skills?: string[]
          probation_months?: number | null
          reports_to_title?: string | null
          required_skills?: string[]
          required_traits?: string[]
          requires_driving_license?: boolean
          requires_overtime?: boolean
          requires_own_car?: boolean
          requires_relocation?: boolean
          requires_travel?: boolean
          requires_weekend?: boolean
          salary_max?: number | null
          salary_min?: number | null
          schedule_end_time?: string | null
          schedule_start_time?: string | null
          shift_type?: string | null
          start_date?: string | null
          start_urgency?: string | null
          status?: string
          team_member_characters?: string[] | null
          team_member_inputs?: Json | null
          title?: string
          updated_at?: string
          vacancy_expires_at?: string
          weight_preset?: string | null
          work_arrangement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "hiring_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_moderation_reviewed_by_fkey"
            columns: ["moderation_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_taxonomy: {
        Row: {
          aliases: string[]
          category: string
          created_at: string
          display_en: string
          display_ms: string | null
          display_zh: string | null
          slug: string
        }
        Insert: {
          aliases?: string[]
          category: string
          created_at?: string
          display_en: string
          display_ms?: string | null
          display_zh?: string | null
          slug: string
        }
        Update: {
          aliases?: string[]
          category?: string
          created_at?: string
          display_en?: string
          display_ms?: string | null
          display_zh?: string | null
          slug?: string
        }
        Relationships: []
      }
      stale_loop_nudges: {
        Row: {
          channel: string[]
          gap_payload: Json
          id: string
          nudge_kind: string
          party: string
          response_at: string | null
          response_kind: string | null
          response_payload: Json | null
          role_id: string | null
          sent_at: string
          subject_id: string
          talent_id: string | null
        }
        Insert: {
          channel?: string[]
          gap_payload?: Json
          id?: string
          nudge_kind?: string
          party: string
          response_at?: string | null
          response_kind?: string | null
          response_payload?: Json | null
          role_id?: string | null
          sent_at?: string
          subject_id: string
          talent_id?: string | null
        }
        Update: {
          channel?: string[]
          gap_payload?: Json
          id?: string
          nudge_kind?: string
          party?: string
          response_at?: string | null
          response_kind?: string | null
          response_payload?: Json | null
          role_id?: string | null
          sent_at?: string
          subject_id?: string
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stale_loop_nudges_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stale_loop_nudges_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_stale_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "stale_loop_nudges_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stale_loop_nudges_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "v_stale_talents"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          id: string
          payment_amount: number | null
          payment_status_snapshot: string | null
          payment_sub_type: string | null
          payment_transaction_id: string | null
          resolved_at: string | null
          status: string
          summary: string | null
          transcript: Json
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          category: string
          created_at?: string
          id?: string
          payment_amount?: number | null
          payment_status_snapshot?: string | null
          payment_sub_type?: string | null
          payment_transaction_id?: string | null
          resolved_at?: string | null
          status?: string
          summary?: string | null
          transcript?: Json
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          id?: string
          payment_amount?: number | null
          payment_status_snapshot?: string | null
          payment_sub_type?: string | null
          payment_transaction_id?: string | null
          resolved_at?: string | null
          status?: string
          summary?: string | null
          transcript?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tag_dictionary: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          tag_name: string
          weight_multiplier: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          tag_name: string
          weight_multiplier?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          tag_name?: string
          weight_multiplier?: number
        }
        Relationships: []
      }
      talent_documents: {
        Row: {
          doc_type: string
          file_name: string | null
          id: string
          purge_after: string | null
          storage_path: string
          talent_id: string
          uploaded_at: string
        }
        Insert: {
          doc_type: string
          file_name?: string | null
          id?: string
          purge_after?: string | null
          storage_path: string
          talent_id: string
          uploaded_at?: string
        }
        Update: {
          doc_type?: string
          file_name?: string | null
          id?: string
          purge_after?: string | null
          storage_path?: string
          talent_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_documents_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_documents_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "v_stale_talents"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      talents: {
        Row: {
          available_days_per_week: number | null
          available_shifts: string[]
          avg_tenure_months: number | null
          candidate_types: string[]
          career_goal_horizon: string | null
          created_at: string
          cultural_alignment_tags: Json | null
          current_employment_status: string | null
          current_salary: number | null
          date_of_birth_encrypted: string | null
          db_min_salary_hard: number | null
          db_no_commission_only: boolean | null
          db_no_driving_license: boolean | null
          db_no_night_shifts: boolean | null
          db_no_overtime: boolean | null
          db_no_own_car: boolean | null
          db_no_relocation: boolean | null
          db_no_travel: boolean | null
          db_no_weekend_work: boolean | null
          db_remote_only: boolean | null
          deal_breaker_items: string[] | null
          deal_breakers: Json | null
          deleted_at: string | null
          derived_tags: Json | null
          education_level: string | null
          employment_type_preferences: string[]
          environment_preferences: string[]
          expected_salary_max: number | null
          expected_salary_min: number | null
          extra_matches_used: number
          extraction_attempts: number
          extraction_completed_at: string | null
          extraction_error: string | null
          extraction_started_at: string | null
          extraction_status: string
          feedback_score: number | null
          feedback_tags: Json | null
          feedback_volume: number
          gender: string | null
          growth_nudge_snooze_until: string | null
          growth_nudges_opt_in: boolean
          has_driving_license: boolean | null
          has_management_experience: boolean | null
          has_noncompete: boolean | null
          highest_qualification: string | null
          ic_path: string | null
          ic_purged_at: string | null
          ic_verified: boolean
          id: string
          interview_answers: Json | null
          is_open_to_offers: boolean
          job_intention: string | null
          languages: Json
          languages_proficiency: Json
          last_growth_nudge_at: string | null
          life_chart_character: string | null
          location_matters: boolean
          location_postcode: string | null
          management_team_size: number | null
          noncompete_industry_scope: string | null
          notice_period_days: number | null
          open_to_new_field: boolean
          parsed_resume: Json | null
          photo_url: string
          phs_accept_rate: number | null
          phs_pass_probation_rate: number | null
          phs_show_rate: number | null
          phs_stay_1y_rate: number | null
          phs_stay_6m_rate: number | null
          preference_ratings: Json | null
          preferred_management_style: string | null
          priority_concerns_atoms: Json
          priority_concerns_text: string | null
          privacy_mode: string
          profile_expires_at: string
          profile_id: string
          race: string | null
          reason_for_leaving_category: string | null
          reason_for_leaving_summary: string | null
          red_flags: string[] | null
          region_code: string
          religion: string | null
          reputation_score: number | null
          resume_path: string | null
          role_scope_preference: string | null
          salary_structure_preference: string | null
          shortest_tenure_months: number | null
          skills: string[]
          updated_at: string
          uses_lunar_calendar: boolean
          whitelist_companies: string[]
          work_arrangement_preference: string | null
          work_authorization: string | null
        }
        Insert: {
          available_days_per_week?: number | null
          available_shifts?: string[]
          avg_tenure_months?: number | null
          candidate_types?: string[]
          career_goal_horizon?: string | null
          created_at?: string
          cultural_alignment_tags?: Json | null
          current_employment_status?: string | null
          current_salary?: number | null
          date_of_birth_encrypted?: string | null
          db_min_salary_hard?: number | null
          db_no_commission_only?: boolean | null
          db_no_driving_license?: boolean | null
          db_no_night_shifts?: boolean | null
          db_no_overtime?: boolean | null
          db_no_own_car?: boolean | null
          db_no_relocation?: boolean | null
          db_no_travel?: boolean | null
          db_no_weekend_work?: boolean | null
          db_remote_only?: boolean | null
          deal_breaker_items?: string[] | null
          deal_breakers?: Json | null
          deleted_at?: string | null
          derived_tags?: Json | null
          education_level?: string | null
          employment_type_preferences?: string[]
          environment_preferences?: string[]
          expected_salary_max?: number | null
          expected_salary_min?: number | null
          extra_matches_used?: number
          extraction_attempts?: number
          extraction_completed_at?: string | null
          extraction_error?: string | null
          extraction_started_at?: string | null
          extraction_status?: string
          feedback_score?: number | null
          feedback_tags?: Json | null
          feedback_volume?: number
          gender?: string | null
          growth_nudge_snooze_until?: string | null
          growth_nudges_opt_in?: boolean
          has_driving_license?: boolean | null
          has_management_experience?: boolean | null
          has_noncompete?: boolean | null
          highest_qualification?: string | null
          ic_path?: string | null
          ic_purged_at?: string | null
          ic_verified?: boolean
          id?: string
          interview_answers?: Json | null
          is_open_to_offers?: boolean
          job_intention?: string | null
          languages?: Json
          languages_proficiency?: Json
          last_growth_nudge_at?: string | null
          life_chart_character?: string | null
          location_matters?: boolean
          location_postcode?: string | null
          management_team_size?: number | null
          noncompete_industry_scope?: string | null
          notice_period_days?: number | null
          open_to_new_field?: boolean
          parsed_resume?: Json | null
          photo_url: string
          phs_accept_rate?: number | null
          phs_pass_probation_rate?: number | null
          phs_show_rate?: number | null
          phs_stay_1y_rate?: number | null
          phs_stay_6m_rate?: number | null
          preference_ratings?: Json | null
          preferred_management_style?: string | null
          priority_concerns_atoms?: Json
          priority_concerns_text?: string | null
          privacy_mode?: string
          profile_expires_at?: string
          profile_id: string
          race?: string | null
          reason_for_leaving_category?: string | null
          reason_for_leaving_summary?: string | null
          red_flags?: string[] | null
          region_code?: string
          religion?: string | null
          reputation_score?: number | null
          resume_path?: string | null
          role_scope_preference?: string | null
          salary_structure_preference?: string | null
          shortest_tenure_months?: number | null
          skills?: string[]
          updated_at?: string
          uses_lunar_calendar?: boolean
          whitelist_companies?: string[]
          work_arrangement_preference?: string | null
          work_authorization?: string | null
        }
        Update: {
          available_days_per_week?: number | null
          available_shifts?: string[]
          avg_tenure_months?: number | null
          candidate_types?: string[]
          career_goal_horizon?: string | null
          created_at?: string
          cultural_alignment_tags?: Json | null
          current_employment_status?: string | null
          current_salary?: number | null
          date_of_birth_encrypted?: string | null
          db_min_salary_hard?: number | null
          db_no_commission_only?: boolean | null
          db_no_driving_license?: boolean | null
          db_no_night_shifts?: boolean | null
          db_no_overtime?: boolean | null
          db_no_own_car?: boolean | null
          db_no_relocation?: boolean | null
          db_no_travel?: boolean | null
          db_no_weekend_work?: boolean | null
          db_remote_only?: boolean | null
          deal_breaker_items?: string[] | null
          deal_breakers?: Json | null
          deleted_at?: string | null
          derived_tags?: Json | null
          education_level?: string | null
          employment_type_preferences?: string[]
          environment_preferences?: string[]
          expected_salary_max?: number | null
          expected_salary_min?: number | null
          extra_matches_used?: number
          extraction_attempts?: number
          extraction_completed_at?: string | null
          extraction_error?: string | null
          extraction_started_at?: string | null
          extraction_status?: string
          feedback_score?: number | null
          feedback_tags?: Json | null
          feedback_volume?: number
          gender?: string | null
          growth_nudge_snooze_until?: string | null
          growth_nudges_opt_in?: boolean
          has_driving_license?: boolean | null
          has_management_experience?: boolean | null
          has_noncompete?: boolean | null
          highest_qualification?: string | null
          ic_path?: string | null
          ic_purged_at?: string | null
          ic_verified?: boolean
          id?: string
          interview_answers?: Json | null
          is_open_to_offers?: boolean
          job_intention?: string | null
          languages?: Json
          languages_proficiency?: Json
          last_growth_nudge_at?: string | null
          life_chart_character?: string | null
          location_matters?: boolean
          location_postcode?: string | null
          management_team_size?: number | null
          noncompete_industry_scope?: string | null
          notice_period_days?: number | null
          open_to_new_field?: boolean
          parsed_resume?: Json | null
          photo_url?: string
          phs_accept_rate?: number | null
          phs_pass_probation_rate?: number | null
          phs_show_rate?: number | null
          phs_stay_1y_rate?: number | null
          phs_stay_6m_rate?: number | null
          preference_ratings?: Json | null
          preferred_management_style?: string | null
          priority_concerns_atoms?: Json
          priority_concerns_text?: string | null
          privacy_mode?: string
          profile_expires_at?: string
          profile_id?: string
          race?: string | null
          reason_for_leaving_category?: string | null
          reason_for_leaving_summary?: string | null
          red_flags?: string[] | null
          region_code?: string
          religion?: string | null
          reputation_score?: number | null
          resume_path?: string | null
          role_scope_preference?: string | null
          salary_structure_preference?: string | null
          shortest_tenure_months?: number | null
          skills?: string[]
          updated_at?: string
          uses_lunar_calendar?: boolean
          whitelist_companies?: string[]
          work_arrangement_preference?: string | null
          work_authorization?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      urgent_priority_requests: {
        Row: {
          completed_at: string | null
          context: Json
          cost: number
          created_at: string
          error_message: string | null
          id: string
          processed_at: string | null
          request_type: string
          result_id: string | null
          result_kind: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          cost: number
          created_at?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          request_type: string
          result_id?: string | null
          result_kind?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          context?: Json
          cost?: number
          created_at?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          request_type?: string
          result_id?: string | null
          result_kind?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "urgent_priority_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tags: {
        Row: {
          created_at: string
          id: string
          score: number | null
          source: string | null
          tag_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          score?: number | null
          source?: string | null
          tag_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          score?: number | null
          source?: string | null
          tag_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tags_tag_name_fkey"
            columns: ["tag_name"]
            isOneToOne: false
            referencedRelation: "tag_dictionary"
            referencedColumns: ["tag_name"]
          },
          {
            foreignKeyName: "user_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          intended_role: string | null
          note: string | null
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          intended_role?: string | null
          note?: string | null
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          intended_role?: string | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ai_chat_usage_daily: {
        Row: {
          assistant_messages: number | null
          day_myt: string | null
          endpoint: string | null
          input_tokens: number | null
          output_tokens: number | null
          provider: string | null
          total_tokens: number | null
          user_id: string | null
          user_messages: number | null
          user_role: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_queue_stats: {
        Row: {
          avg_seconds: number | null
          count: number | null
          max_retries: number | null
          oldest: string | null
          status: string | null
          total_retries: number | null
        }
        Relationships: []
      }
      mv_admin_kpis: {
        Row: {
          avg_hours_to_first_view: number | null
          cnt_accepted_talent: number | null
          cnt_declined_manager: number | null
          cnt_declined_talent: number | null
          cnt_expired: number | null
          cnt_generated: number | null
          cnt_hired: number | null
          cnt_hr_scheduling: number | null
          cnt_interview_completed: number | null
          cnt_interview_scheduled: number | null
          cnt_invited_manager: number | null
          cnt_viewed: number | null
          refreshed_at: string | null
          total_matches: number | null
        }
        Relationships: []
      }
      perf_table_bloat: {
        Row: {
          dead_pct: number | null
          dead_rows: number | null
          last_autoanalyze: string | null
          last_autovacuum: string | null
          live_rows: number | null
          schemaname: unknown
          table_name: unknown
          total_size: string | null
        }
        Relationships: []
      }
      perf_unused_indexes: {
        Row: {
          index_name: unknown
          index_size: string | null
          scans_since_reset: number | null
          schemaname: unknown
          table_name: unknown
        }
        Relationships: []
      }
      v_stale_roles: {
        Row: {
          created_at: string | null
          experience_level: string | null
          hiring_manager_id: string | null
          location: string | null
          role_id: string | null
          salary_max: number | null
          title: string | null
          work_arrangement: string | null
        }
        Insert: {
          created_at?: string | null
          experience_level?: string | null
          hiring_manager_id?: string | null
          location?: string | null
          role_id?: string | null
          salary_max?: number | null
          title?: string | null
          work_arrangement?: string | null
        }
        Update: {
          created_at?: string | null
          experience_level?: string | null
          hiring_manager_id?: string | null
          location?: string | null
          role_id?: string | null
          salary_max?: number | null
          title?: string | null
          work_arrangement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "hiring_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stale_talents: {
        Row: {
          created_at: string | null
          expected_salary_max: number | null
          expected_salary_min: number | null
          profile_id: string | null
          talent_id: string | null
        }
        Insert: {
          created_at?: string | null
          expected_salary_max?: number | null
          expected_salary_min?: number | null
          profile_id?: string | null
          talent_id?: string | null
        }
        Update: {
          created_at?: string | null
          expected_salary_max?: number | null
          expected_salary_min?: number | null
          profile_id?: string | null
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _warmup_schedule_edge_function: {
        Args: { fn_name: string }
        Returns: undefined
      }
      active_talent_count: { Args: never; Returns: number }
      add_score_noise: {
        Args: { p_noise_max?: number; p_score: number }
        Returns: number
      }
      admin_decide_role_moderation: {
        Args: {
          p_category?: string
          p_decision: string
          p_reason?: string
          p_role_id: string
        }
        Returns: undefined
      }
      admin_get_ic_metadata: {
        Args: { p_talent_id: string }
        Returns: {
          ic_path: string
          ic_purged_at: string
          ic_verified: boolean
        }[]
      }
      appeal_role_moderation: {
        Args: { p_appeal_text: string; p_role_id: string }
        Returns: undefined
      }
      auth_hr_company_id: { Args: never; Returns: string }
      award_points:
        | {
            Args: {
              p_delta: number
              p_reason: string
              p_reference?: Json
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_delta: number
              p_idempotency_key?: string
              p_reason: string
              p_reference?: Json
              p_user_id: string
            }
            Returns: number
          }
      bump_ghost_scores_for_expired: {
        Args: { p_role_ids: string[]; p_talent_ids: string[] }
        Returns: undefined
      }
      can_insert_company: { Args: never; Returns: boolean }
      can_run_urgent_match_for_role: {
        Args: { p_role_id: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      charge_urgent_priority: {
        Args: { p_context?: Json; p_request_type: string; p_user_id: string }
        Returns: {
          balance_after: number
          cost: number
          request_id: string
        }[]
      }
      check_and_increment_chat_rate: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          count: number
          limit_val: number
        }[]
      }
      check_and_increment_rate: {
        Args: { p_key: string; p_limit: number; p_window_seconds?: number }
        Returns: boolean
      }
      check_login_rate_limit: { Args: { p_email: string }; Returns: Json }
      claim_match_queue_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          id: number
          retry_count: number
          role_id: string
        }[]
      }
      claim_notification_retry_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          attempt_count: number
          channel: string
          id: string
          notify_type: string
          payload: Json
          user_id: string
        }[]
      }
      compare_nn_concerns: {
        Args: { p_role_id: string; p_talent_id: string }
        Returns: {
          atom_index: number
          atom_text: string
          cosine_distance: number
          dim: number
          match_text: string
          provider: string
          side: string
        }[]
      }
      complete_match_queue_item: { Args: { p_id: number }; Returns: undefined }
      compute_age_match_score: {
        Args: { hm_dob: string; talent_dob: string }
        Returns: number
      }
      cron_deadman_check: { Args: never; Returns: undefined }
      decrypt_dob: { Args: { encrypted: string }; Returns: string }
      diamond_points_for_stage: { Args: { p_stage: string }; Returns: number }
      edu_rank: { Args: { level: string }; Returns: number }
      encrypt_dob: { Args: { dob_text: string }; Returns: string }
      enqueue_active_roles_for_rematch: {
        Args: { p_limit?: number; p_priority?: number }
        Returns: number
      }
      enqueue_notification: {
        Args: {
          p_channel?: string
          p_notify_type: string
          p_payload?: Json
          p_user_id: string
        }
        Returns: string
      }
      enqueue_roles_for_rematch: {
        Args: { p_priority?: number; p_role_ids: string[] }
        Returns: number
      }
      enqueue_unmatched_roles: {
        Args: { p_priority?: number }
        Returns: number
      }
      fail_match_queue_item: {
        Args: { p_error: string; p_id: number; p_retry_count: number }
        Returns: undefined
      }
      fn_compute_role_market_gap: { Args: { p_role_id: string }; Returns: Json }
      fn_compute_talent_market_gap: {
        Args: { p_talent_id: string }
        Returns: Json
      }
      fn_stale_loop_record_response: {
        Args: {
          p_nudge_id: string
          p_response_kind: string
          p_response_payload?: Json
        }
        Returns: undefined
      }
      generate_referral_code: { Args: never; Returns: string }
      get_admin_audit_log: {
        Args: {
          p_action?: string
          p_actor_id?: string
          p_page?: number
          p_page_size?: number
          p_subject_id?: string
        }
        Returns: {
          action: string
          actor_id: string
          actor_role: string
          created_at: string
          id: number
          metadata: Json
          resource_id: string
          resource_type: string
          subject_id: string
        }[]
      }
      get_admin_kpis: { Args: never; Returns: Json }
      get_admin_kpis_fast: { Args: never; Returns: Json }
      get_admin_matches: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          compatibility_score: number
          created_at: string
          expires_at: string
          id: string
          internal_reasoning: Json
          life_chart_score: number
          role_title: string
          status: string
          tag_compatibility: number
          talent_id: string
          talent_profile_id: string
        }[]
      }
      get_age_peak_scores: {
        Args: { p_hm_dob: string; p_talent_ids: string[] }
        Returns: {
          age_score: number
          peak_age_score: number
          talent_id: string
        }[]
      }
      get_career_nudge: { Args: { p_year?: number }; Returns: string }
      get_life_chart_bucket: {
        Args: { hm_char: string; talent_char: string }
        Returns: string
      }
      get_match_candidates: {
        Args: {
          p_employment_type?: string
          p_excluded_ids?: string[]
          p_has_night_shifts?: boolean
          p_hm_character?: string
          p_hm_company_size?: string
          p_is_commission?: boolean
          p_languages_required?: Json
          p_limit?: number
          p_min_education?: string
          p_required_skills?: string[]
          p_required_work_auth?: string[]
          p_requires_driving?: boolean
          p_requires_overtime?: boolean
          p_requires_own_car?: boolean
          p_requires_relocation?: boolean
          p_requires_travel?: boolean
          p_requires_weekend?: boolean
          p_role_atoms?: Json
          p_role_eligibility?: string[]
          p_role_industry?: string
          p_salary_max?: number
          p_work_arrangement?: string
        }
        Returns: {
          talent_id: string
        }[]
      }
      get_match_profile_preview: {
        Args: { p_match_id: string }
        Returns: {
          display_name: string
          photo_url: string
          privacy_mode: string
        }[]
      }
      get_match_profile_previews: {
        Args: { p_match_ids: string[] }
        Returns: {
          display_name: string
          match_id: string
          photo_url: string
          privacy_mode: string
        }[]
      }
      get_monthly_boost_characters: {
        Args: { p_month: string }
        Returns: string[]
      }
      get_own_ic_metadata: {
        Args: never
        Returns: {
          ic_path: string
          ic_purged_at: string
          ic_verified: boolean
        }[]
      }
      get_peak_age_score:
        | {
            Args: { p_born_day: number; p_character: string; p_dob: string }
            Returns: number
          }
        | {
            Args: {
              p_born_day: number
              p_character: string
              p_dob: string
              p_uses_lunar?: boolean
            }
            Returns: number
          }
      get_pending_match_reasoning: {
        Args: never
        Returns: {
          internal_reasoning: Json
          life_chart_score: number
          match_id: string
        }[]
      }
      get_talent_contact: {
        Args: { p_match_id: string }
        Returns: {
          email: string
          full_name: string
          phone: string
        }[]
      }
      get_urgent_jobs_for_talent: {
        Args: { p_limit?: number; p_talent_id: string }
        Returns: {
          role_id: string
        }[]
      }
      get_year_luck_stage: {
        Args: { p_character: string; p_year: number }
        Returns: number
      }
      growth_age_weight: {
        Args: {
          p_age: number
          p_cutoff: number
          p_floor: number
          p_ramp: number
        }
        Returns: number
      }
      hm_can_see_talent: {
        Args: { target_talent_id: string }
        Returns: boolean
      }
      increment_extra_matches_used: {
        Args: { p_id: string; p_qty: number; p_table: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_hm_for_match: { Args: { p_match_id: string }; Returns: boolean }
      is_talent_for_match: { Args: { p_match_id: string }; Returns: boolean }
      list_growth_nudge_candidates: {
        Args: never
        Returns: {
          age_cutoff: number
          age_ramp_years: number
          age_weight_floor: number
          encrypted_dob: string
          fortune_score: number
          max_jobs_per_nudge: number
          profile_id: string
          region_code: string
          score_threshold: number
          talent_id: string
        }[]
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_actor_id: string
          p_actor_role: string
          p_ip_hash?: string
          p_metadata?: Json
          p_resource_id?: string
          p_resource_type?: string
          p_subject_id: string
          p_ua_hash?: string
        }
        Returns: undefined
      }
      log_auth_failure: {
        Args: { p_email_domain: string; p_reason: string; p_user_agent: string }
        Returns: undefined
      }
      log_cv_download: { Args: { p_match_id: string }; Returns: undefined }
      mark_urgent_request_completed: {
        Args: {
          p_error?: string
          p_request_id: string
          p_result_id?: string
          p_result_kind?: string
          p_status: string
        }
        Returns: undefined
      }
      pick_top_jobs_for_talent: {
        Args: { p_limit?: number; p_talent_id: string }
        Returns: {
          location: string
          rank_score: number
          role_id: string
          salary_max: number
          salary_min: number
          title: string
        }[]
      }
      pipeline_health: { Args: never; Returns: Json }
      profile_visible_to_company_hr: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      purge_soft_deleted_after_30d: {
        Args: never
        Returns: {
          purged_count: number
        }[]
      }
      record_consent: {
        Args: { p_ip_hash?: string; p_version: string }
        Returns: undefined
      }
      record_growth_nudge: {
        Args: { p_outbox_id: string; p_role_ids: string[]; p_talent_id: string }
        Returns: string
      }
      record_login_attempt: {
        Args: { p_email: string; p_succeeded: boolean }
        Returns: undefined
      }
      record_notification_attempt: {
        Args: { p_error?: string; p_outbox_id: string; p_success: boolean }
        Returns: undefined
      }
      redeem_points_for: {
        Args: {
          p_cost: number
          p_idempotency_key: string
          p_reason: string
          p_user_id: string
        }
        Returns: number
      }
      refresh_admin_kpis_mv: { Args: never; Returns: undefined }
      reset_stalled_match_queue: { Args: never; Returns: number }
      send_onboarding_reminders: {
        Args: never
        Returns: {
          email: string
          profile_id: string
          request_id: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      snooze_growth_nudges: { Args: { p_months?: number }; Returns: string }
      solar_to_lunar_day: { Args: { p_dob: string }; Returns: number }
      take_admin_daily_snapshot: { Args: never; Returns: undefined }
      talent_can_see_role: {
        Args: { target_role_id: string }
        Returns: boolean
      }
      upsert_monthly_boost: {
        Args: { p_admin_id: string; p_characters: Json; p_month: string }
        Returns: undefined
      }
      user_is_hm_in_company: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      user_is_hm_of_role: { Args: { target_role_id: string }; Returns: boolean }
      user_is_hr_of_company: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      user_is_hr_of_role: { Args: { target_role_id: string }; Returns: boolean }
      year_luck_anchor: { Args: { p_character: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
