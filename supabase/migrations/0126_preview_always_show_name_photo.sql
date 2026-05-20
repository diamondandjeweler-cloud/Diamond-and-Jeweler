-- 0126: HMs always see candidate name + photo on matches.
-- Contact info (email/phone) remains gated by get_talent_contact at offer stage.
-- Privacy_mode no longer hides name/photo from the matched HM.

create or replace function public.get_match_profile_preview(p_match_id uuid)
returns table(display_name text, photo_url text, privacy_mode text)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_hm_profile_id    uuid;
  v_talent_pid       uuid;
  v_privacy          text;
  v_full_name        text;
  v_photo            text;
  v_caller           uuid := auth.uid();
begin
  select hm.profile_id, t.profile_id, t.privacy_mode, t.photo_url
    into v_hm_profile_id, v_talent_pid, v_privacy, v_photo
  from matches m
  join roles  r  on r.id = m.role_id
  join hiring_managers hm on hm.id = r.hiring_manager_id
  join talents t on t.id = m.talent_id
  where m.id = p_match_id;

  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;

  if v_caller <> v_hm_profile_id
     and v_caller <> v_talent_pid
     and not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select p.full_name into v_full_name from profiles p where p.id = v_talent_pid;

  return query select v_full_name, v_photo, v_privacy;
end;
$$;

comment on function public.get_match_profile_preview(uuid) is
  'Candidate name + photo for the matched HM. Contact info stays gated by get_talent_contact.';

-- Photo becomes a required field on talents going forward.
-- Backfill existing nulls to empty string to satisfy the constraint;
-- onboarding form already enforces upload for new sign-ups.
update public.talents set photo_url = '' where photo_url is null;
alter table public.talents alter column photo_url set not null;
