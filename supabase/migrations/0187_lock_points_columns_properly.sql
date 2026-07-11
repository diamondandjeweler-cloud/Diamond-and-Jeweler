-- =============================================================================
-- 0187 — properly lock the points balance columns (fixes 0186's no-op)  (2026-07-11)
-- =============================================================================
-- 0186 tried `revoke update (points, points_earned_total)` but public.profiles
-- also carries a TABLE-LEVEL update grant to authenticated + anon, and a
-- column-level REVOKE cannot override a table-level grant — so the P0 self-minted-
-- points hole stayed open (verified: authenticated still shows UPDATE on points
-- after 0186). Postgres has no "revoke one column while a table grant exists";
-- the only correct form is: revoke the table grant, then re-grant UPDATE on every
-- OTHER column. award_points() is SECURITY DEFINER owned by postgres, so it keeps
-- writing all three balance columns regardless of these grants.
--
-- Three balance columns are locked: points, points_earned_total, diamond_points.
-- anon is NOT re-granted (it has no profiles UPDATE RLS policy — verified — so it
-- never legitimately updates a profile). authenticated keeps UPDATE on every
-- non-balance column, preserving updateProfile() (consent/whatsapp/locale/…).
--
-- ROLLBACK:  grant update on public.profiles to authenticated, anon;
-- =============================================================================

begin;

revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

grant update (
  id, email, full_name, phone, role, consents, is_banned, ghost_score,
  onboarding_complete, waitlist_approved, created_at, updated_at, consent_version,
  consent_signed_at, consent_ip_hash, locale, whatsapp_number, whatsapp_opt_in,
  interview_transcript, referral_code, deleted_at, email_bounced, display_name,
  onboarding_reminder_sent_at, onboarding_reminder_count
) on public.profiles to authenticated;

commit;
