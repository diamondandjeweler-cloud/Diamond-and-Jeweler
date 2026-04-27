-- ============================================================
-- BoLe Platform — Row Level Security (Milestone 1)
-- Enable RLS on every table; define per-role policies.
-- Service role bypasses RLS entirely.
-- Runs AFTER 0002_helpers.sql (depends on public.is_admin()).
-- ============================================================

alter table public.profiles            enable row level security;
alter table public.companies           enable row level security;
alter table public.hiring_managers     enable row level security;
alter table public.talents             enable row level security;
alter table public.roles               enable row level security;
alter table public.matches             enable row level security;
alter table public.match_history       enable row level security;
alter table public.interviews          enable row level security;
alter table public.notifications       enable row level security;
alter table public.tag_dictionary      enable row level security;
alter table public.user_tags           enable row level security;
alter table public.admin_actions       enable row level security;
alter table public.system_config       enable row level security;
alter table public.market_rate_cache   enable row level security;
alter table public.cold_start_queue    enable row level security;
alter table public.data_requests       enable row level security;
alter table public.waitlist            enable row level security;
alter table public.life_chart_base         enable row level security;
alter table public.life_chart_adjustments  enable row level security;
alter table public.life_chart_cache        enable row level security;

-- ---------- profiles ----------

create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

-- INSERT is handled by the on_auth_user_created trigger (SECURITY DEFINER),
-- not by end users. Keep a policy for explicit client inserts if ever needed.
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Users cannot promote themselves to admin
    and role in ('talent','hiring_manager','hr_admin')
    and is_banned = false
  );

create policy profiles_update_admin on public.profiles
  for update using (public.is_admin());

-- ---------- companies ----------

-- HR admins create their own company; primary_hr_email must match their profile email.
create policy companies_insert_hr on public.companies
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'hr_admin'
        and p.email = primary_hr_email
    )
  );

create policy companies_select_hr on public.companies
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'hr_admin'
        and p.email = primary_hr_email
    )
  );

create policy companies_select_hm on public.companies
  for select using (
    exists (
      select 1 from public.hiring_managers hm
      where hm.profile_id = auth.uid() and hm.company_id = companies.id
    )
  );

create policy companies_update_hr on public.companies
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'hr_admin'
        and p.email = primary_hr_email
    )
  );

create policy companies_all_admin on public.companies
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- hiring_managers ----------

-- HM rows are created by the invite-hm Edge Function running as service_role,
-- which bypasses RLS. Authenticated clients can only read/update their own row.

create policy hm_select_self on public.hiring_managers
  for select using (profile_id = auth.uid());

create policy hm_select_hr_same_company on public.hiring_managers
  for select using (
    exists (
      select 1 from public.companies c
      join public.profiles p on p.email = c.primary_hr_email
      where c.id = hiring_managers.company_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  );

create policy hm_update_self on public.hiring_managers
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy hm_all_admin on public.hiring_managers
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- talents ----------

create policy talents_insert_self on public.talents
  for insert with check (profile_id = auth.uid());

create policy talents_select_self on public.talents
  for select using (profile_id = auth.uid());

create policy talents_update_self on public.talents
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- HMs see talent rows only if a match exists (non-sensitive fields still require
-- a view or explicit column-level GRANT to hide DOB/IC — addressed in Milestone 2).
create policy talents_select_hm_via_match on public.talents
  for select using (
    exists (
      select 1
      from public.matches m
      join public.roles r on r.id = m.role_id
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where m.talent_id = talents.id and hm.profile_id = auth.uid()
    )
  );

create policy talents_all_admin on public.talents
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- roles ----------

create policy roles_insert_hm on public.roles
  for insert with check (
    exists (
      select 1 from public.hiring_managers hm
      where hm.id = hiring_manager_id and hm.profile_id = auth.uid()
    )
  );

create policy roles_select_hm on public.roles
  for select using (
    exists (
      select 1 from public.hiring_managers hm
      where hm.id = hiring_manager_id and hm.profile_id = auth.uid()
    )
  );

create policy roles_update_hm on public.roles
  for update using (
    exists (
      select 1 from public.hiring_managers hm
      where hm.id = hiring_manager_id and hm.profile_id = auth.uid()
    )
  );

create policy roles_select_hr_same_company on public.roles
  for select using (
    exists (
      select 1
      from public.hiring_managers hm
      join public.companies c on c.id = hm.company_id
      join public.profiles p on p.email = c.primary_hr_email
      where hm.id = roles.hiring_manager_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  );

-- Talents see only the role attached to one of their matches.
create policy roles_select_talent_via_match on public.roles
  for select using (
    exists (
      select 1
      from public.matches m
      join public.talents t on t.id = m.talent_id
      where m.role_id = roles.id and t.profile_id = auth.uid()
    )
  );

create policy roles_all_admin on public.roles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- matches ----------

create policy matches_select_talent on public.matches
  for select using (
    exists (
      select 1 from public.talents t
      where t.id = matches.talent_id and t.profile_id = auth.uid()
    )
  );

create policy matches_select_hm on public.matches
  for select using (
    exists (
      select 1
      from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where r.id = matches.role_id and hm.profile_id = auth.uid()
    )
  );

create policy matches_select_hr on public.matches
  for select using (
    exists (
      select 1
      from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      join public.companies c on c.id = hm.company_id
      join public.profiles p on p.email = c.primary_hr_email
      where r.id = matches.role_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  );

-- UPDATEs: talent can act on own matches; HM can act on matches for own roles.
-- State-transition validity is enforced by Edge Functions (Milestone 3).
create policy matches_update_talent on public.matches
  for update using (
    exists (
      select 1 from public.talents t
      where t.id = matches.talent_id and t.profile_id = auth.uid()
    )
  );

create policy matches_update_hm on public.matches
  for update using (
    exists (
      select 1
      from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where r.id = matches.role_id and hm.profile_id = auth.uid()
    )
  );

create policy matches_update_hr on public.matches
  for update using (
    exists (
      select 1
      from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      join public.companies c on c.id = hm.company_id
      join public.profiles p on p.email = c.primary_hr_email
      where r.id = matches.role_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  );

create policy matches_all_admin on public.matches
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- match_history (admin-only read; inserts by service_role) ----------

create policy match_history_admin on public.match_history
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- interviews ----------

create policy interviews_select_talent on public.interviews
  for select using (
    exists (
      select 1
      from public.matches m
      join public.talents t on t.id = m.talent_id
      where m.id = interviews.match_id and t.profile_id = auth.uid()
    )
  );

create policy interviews_select_hm on public.interviews
  for select using (
    exists (
      select 1
      from public.matches m
      join public.roles r on r.id = m.role_id
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where m.id = interviews.match_id and hm.profile_id = auth.uid()
    )
  );

create policy interviews_all_hr on public.interviews
  for all using (
    exists (
      select 1
      from public.matches m
      join public.roles r on r.id = m.role_id
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      join public.companies c on c.id = hm.company_id
      join public.profiles p on p.email = c.primary_hr_email
      where m.id = interviews.match_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.matches m
      join public.roles r on r.id = m.role_id
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      join public.companies c on c.id = hm.company_id
      join public.profiles p on p.email = c.primary_hr_email
      where m.id = interviews.match_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  );

create policy interviews_all_admin on public.interviews
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- notifications ----------

create policy notifications_select_self on public.notifications
  for select using (user_id = auth.uid());

create policy notifications_update_self on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_all_admin on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- tag_dictionary (public read, admin write) ----------

create policy tag_dict_select_all on public.tag_dictionary
  for select using (is_active = true or public.is_admin());

create policy tag_dict_all_admin on public.tag_dictionary
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- user_tags ----------

create policy user_tags_select_self on public.user_tags
  for select using (user_id = auth.uid());

create policy user_tags_all_admin on public.user_tags
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- admin_actions (admin only) ----------

create policy admin_actions_all_admin on public.admin_actions
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- system_config (public read of non-secret keys, admin write) ----------

create policy system_config_select on public.system_config
  for select using (key not like 'secret.%' or public.is_admin());

create policy system_config_all_admin on public.system_config
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- market_rate_cache (public read, admin write) ----------

create policy market_rate_select on public.market_rate_cache
  for select using (true);

create policy market_rate_all_admin on public.market_rate_cache
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- cold_start_queue (admin only) ----------

create policy cold_start_all_admin on public.cold_start_queue
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- data_requests (PDPA DSR) ----------

create policy data_requests_insert_self on public.data_requests
  for insert with check (user_id = auth.uid());

create policy data_requests_select_self on public.data_requests
  for select using (user_id = auth.uid());

create policy data_requests_all_admin on public.data_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- waitlist ----------
-- Anyone (anon) can insert their email; only admin can read / approve.
-- NOTE: inserts are open; a CAPTCHA + rate limit at the edge is added in Milestone 4.

create policy waitlist_insert_public on public.waitlist
  for insert to anon, authenticated
  with check (true);

create policy waitlist_all_admin on public.waitlist
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- life_chart_* (admin only — proprietary data) ----------

create policy life_chart_base_admin on public.life_chart_base
  for all using (public.is_admin()) with check (public.is_admin());

create policy life_chart_adjustments_admin on public.life_chart_adjustments
  for all using (public.is_admin()) with check (public.is_admin());

create policy life_chart_cache_admin on public.life_chart_cache
  for all using (public.is_admin()) with check (public.is_admin());
