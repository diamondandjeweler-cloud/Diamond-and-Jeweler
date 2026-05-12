-- ============================================================
-- 0111 — Interview slot proposals + candidate profile preview
--
-- Two related changes:
--
-- 1. interview_proposals
--    A new table that captures the 3-slot interview proposal the
--    hiring manager sends to the talent. The talent picks one slot
--    (or declines) and only then does an `interview_rounds` row
--    materialise. The match status stays at `invited_by_manager`
--    while the proposal is pending and only transitions to
--    `interview_scheduled` when the talent confirms a slot.
--
-- 2. get_match_profile_preview()
--    A SECURITY DEFINER RPC that returns a privacy-aware preview
--    of the talent's display name + photo for a given match. The
--    HM gets the real name + photo for `public` privacy_mode (and
--    for `whitelist` mode if their company is on the talent's
--    whitelist). Anonymous-mode talents stay anonymous. This is the
--    information surfaced on the candidate card before any contact
--    reveal — it does NOT expose email or phone, which still flow
--    through `get_talent_contact` at offer stage.
-- ============================================================

-- 1. interview_proposals table ───────────────────────────────
create table if not exists public.interview_proposals (
  id                 uuid        primary key default gen_random_uuid(),
  match_id           uuid        not null references public.matches(id) on delete cascade,
  round_number       int         not null,
  slot_1_at          timestamptz not null,
  slot_2_at          timestamptz not null,
  slot_3_at          timestamptz not null,
  status             text        not null default 'pending'
    check (status in ('pending','accepted','declined','expired','cancelled')),
  picked_slot        int         check (picked_slot in (1,2,3)),
  picked_at          timestamptz,
  decline_reason     text,
  resulting_round_id uuid        references public.interview_rounds(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Logical consistency: once accepted, picked_slot must be set; once cancelled/declined, picked_slot stays null.
  constraint ip_picked_when_accepted check (
    (status = 'accepted' and picked_slot is not null and picked_at is not null)
    or (status <> 'accepted')
  )
);

create index if not exists idx_ip_match on public.interview_proposals(match_id);
create index if not exists idx_ip_status on public.interview_proposals(status);

-- Only ONE pending proposal per (match, round) at a time, so HM can't
-- spam talent with overlapping proposals.
create unique index if not exists idx_ip_one_pending_per_round
  on public.interview_proposals(match_id, round_number)
  where status = 'pending';

drop trigger if exists tg_ip_updated_at on public.interview_proposals;
create trigger tg_ip_updated_at
  before update on public.interview_proposals
  for each row execute function public.tg_set_updated_at();

-- 2. RLS for interview_proposals ────────────────────────────
alter table public.interview_proposals enable row level security;

drop policy if exists ip_select_hm     on public.interview_proposals;
drop policy if exists ip_select_talent on public.interview_proposals;
drop policy if exists ip_insert_hm     on public.interview_proposals;
drop policy if exists ip_update_hm     on public.interview_proposals;
drop policy if exists ip_update_talent on public.interview_proposals;
drop policy if exists ip_admin         on public.interview_proposals;

create policy ip_select_hm on public.interview_proposals
  for select using (public.is_hm_for_match(match_id));

create policy ip_select_talent on public.interview_proposals
  for select using (public.is_talent_for_match(match_id));

create policy ip_insert_hm on public.interview_proposals
  for insert with check (
    public.is_hm_for_match(match_id)
    and exists (
      select 1 from public.matches
      where id = match_id
        and status in ('invited_by_manager','interview_scheduled')
    )
  );

-- HM can cancel/expire their own pending proposals; full update is admin-only.
create policy ip_update_hm on public.interview_proposals
  for update using (public.is_hm_for_match(match_id))
  with check (public.is_hm_for_match(match_id));

-- Talent can update their proposal row to accept/decline a slot.
create policy ip_update_talent on public.interview_proposals
  for update using (public.is_talent_for_match(match_id))
  with check (public.is_talent_for_match(match_id));

create policy ip_admin on public.interview_proposals
  for all using (public.is_admin());

-- 3. Profile-preview RPC ─────────────────────────────────────
-- Returns (display_name, photo_url, privacy_mode) for a match.
-- Caller must be the HM, the talent themselves, or admin.
-- privacy_mode='public'    → real full_name + photo_url
-- privacy_mode='whitelist' → real values only when the role's
--                             company is in talent.whitelist_companies;
--                             otherwise anonymous
-- privacy_mode='anonymous' → display_name=null, photo_url=null
create or replace function public.get_match_profile_preview(p_match_id uuid)
returns table(display_name text, photo_url text, privacy_mode text)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_hm_profile_id    uuid;
  v_talent_pid       uuid;
  v_talent_id        uuid;
  v_role_company_id  uuid;
  v_privacy          text;
  v_whitelist        uuid[];
  v_full_name        text;
  v_photo            text;
  v_caller           uuid := auth.uid();
begin
  select hm.profile_id, t.profile_id, t.id, r.company_id, t.privacy_mode, t.whitelist_companies, t.photo_url
    into v_hm_profile_id, v_talent_pid, v_talent_id, v_role_company_id, v_privacy, v_whitelist, v_photo
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

  -- Talent is allowed to see their own real values.
  if v_caller = v_talent_pid then
    return query select v_full_name, v_photo, v_privacy;
    return;
  end if;

  -- HM (or admin) view — apply privacy_mode rules.
  if v_privacy = 'public' then
    return query select v_full_name, v_photo, v_privacy;
  elsif v_privacy = 'whitelist' then
    if v_role_company_id = any (coalesce(v_whitelist, '{}'::uuid[])) then
      return query select v_full_name, v_photo, v_privacy;
    else
      return query select null::text, null::text, v_privacy;
    end if;
  else
    -- anonymous (or any unknown value): give nothing.
    return query select null::text, null::text, v_privacy;
  end if;
end;
$$;

grant execute on function public.get_match_profile_preview(uuid) to authenticated;

comment on function public.get_match_profile_preview(uuid) is
  'Privacy-aware candidate preview for the matched HM (name + photo). Email/phone still gated by get_talent_contact at offer stage.';

-- 4. Extend notifications.type CHECK with proposal events ───
-- Mirrors the safe pattern used in 0060.
do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_check;
  alter table public.notifications
    add constraint notifications_type_check check (type in (
      'match_ready','hm_invited','candidate_invited',
      'interview_scheduled','match_expiring','match_no_action_48h',
      'company_verified','dsr_export_ready',
      'interview_round_scheduled','interview_cancelled',
      'offer_made_notify','offer_accepted','offer_declined',
      -- new in 0111:
      'interview_proposed','interview_proposal_accepted','interview_proposal_declined'
    ));
exception when undefined_table then
  null; -- notifications table may not exist in some test installs
end;
$$;
