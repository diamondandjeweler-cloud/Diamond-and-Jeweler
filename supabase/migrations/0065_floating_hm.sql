-- ============================================================
-- Floating HM + Company Umbrella Link Flow
--
-- 1. company_id on hiring_managers becomes nullable so HMs
--    can self-register without being invited.
-- 2. New table: company_hm_link_requests tracks HR-admin→HM
--    link invitations (pending / accepted / declined).
-- 3. RLS: floating HMs (company_id IS NULL) cannot see their
--    own matches (matches exist and scoring runs, invisible
--    until they are linked to a verified company).
-- 4. RLS: HR admin can search floating HMs to send link requests.
-- ============================================================

-- 1. Make company_id nullable.
alter table public.hiring_managers
  alter column company_id drop not null;

-- 2. Link-requests table.
create table if not exists public.company_hm_link_requests (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  hm_id           uuid not null references public.hiring_managers(id) on delete cascade,
  requested_by    uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'declined')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  unique (company_id, hm_id)
);

-- Only one pending request per HM at a time (across companies).
create unique index if not exists uq_hm_pending_request
  on public.company_hm_link_requests (hm_id)
  where status = 'pending';

-- 3. RLS on link_requests table.
alter table public.company_hm_link_requests enable row level security;

-- HR admin of the company can manage requests for their company.
create policy link_req_hr_manage on public.company_hm_link_requests
  for all using (
    exists (
      select 1 from public.companies c
      join public.profiles p on p.email = c.primary_hr_email
      where c.id = company_hm_link_requests.company_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  ) with check (
    exists (
      select 1 from public.companies c
      join public.profiles p on p.email = c.primary_hr_email
      where c.id = company_hm_link_requests.company_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  );

-- HM can read and update their own link requests.
create policy link_req_hm_self on public.company_hm_link_requests
  for all using (
    exists (
      select 1 from public.hiring_managers hm
      where hm.id = company_hm_link_requests.hm_id
        and hm.profile_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hiring_managers hm
      where hm.id = company_hm_link_requests.hm_id
        and hm.profile_id = auth.uid()
    )
  );

-- Admin sees everything.
create policy link_req_admin on public.company_hm_link_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- 4. Update matches_select_hm RLS: floating HMs (company_id IS NULL)
--    cannot see their matches. They still get scored, just invisible.
drop policy if exists matches_select_hm on public.matches;

create policy matches_select_hm on public.matches
  for select using (
    matches.status <> 'pending_approval'
    and exists (
      select 1
      from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where r.id = matches.role_id
        and hm.profile_id = auth.uid()
        and hm.company_id is not null
    )
  );

-- 5. HR admin can read floating HMs (for the search panel).
--    Existing hm_select_hr_same_company only covers same-company HMs.
--    Add a policy so HR admins can see floating HMs to invite them.
create policy hm_select_hr_floating on public.hiring_managers
  for select using (
    hiring_managers.company_id is null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('hr_admin', 'admin')
    )
  );
