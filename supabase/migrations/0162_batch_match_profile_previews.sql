-- ============================================================================
-- 0162 — get_match_profile_previews(uuid[]): batch form of
--        get_match_profile_preview (collapse the HMDashboard loadPreviews N+1)
--
-- HMDashboard.loadPreviews() called get_match_profile_preview once per surfaced
-- match card (one RPC round-trip per candidate). This batch variant returns all
-- previews for an array of match ids in a single round-trip.
--
-- Behaviour mirrors 0126 exactly:
--   * SECURITY DEFINER, same join (matches→roles→hiring_managers→talents).
--   * Per-match authorization: a row is returned ONLY if the caller is the
--     match's HM, the matched talent, or an admin. Unauthorized / non-existent
--     ids are simply OMITTED — the single RPC raised on those and the frontend
--     swallowed the error to a null preview, so the merged result is identical.
--   * LEFT JOIN profiles so a talent with no profile row still yields a row with
--     a null display_name (matching the single RPC's separate full_name select).
--   * "Always show name + photo" (0126 intent) preserved — no privacy gating here.
-- ============================================================================

create or replace function public.get_match_profile_previews(p_match_ids uuid[])
returns table (match_id uuid, display_name text, photo_url text, privacy_mode text)
language sql
security definer
stable
set search_path to 'public', 'auth'
as $$
  select m.id, p.full_name, t.photo_url, t.privacy_mode
  from public.matches m
  join public.roles r            on r.id  = m.role_id
  join public.hiring_managers hm on hm.id = r.hiring_manager_id
  join public.talents t          on t.id  = m.talent_id
  left join public.profiles p    on p.id  = t.profile_id
  where m.id = any(p_match_ids)
    and (auth.uid() = hm.profile_id or auth.uid() = t.profile_id or public.is_admin());
$$;

revoke all on function public.get_match_profile_previews(uuid[]) from public;
grant execute on function public.get_match_profile_previews(uuid[]) to authenticated;

notify pgrst, 'reload schema';
