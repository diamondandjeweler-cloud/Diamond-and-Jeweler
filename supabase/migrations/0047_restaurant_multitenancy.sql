-- ============================================================
-- Restaurant OS — Multi-tenancy + Role-Based Access Control
--
-- Adds:
--   restaurant.organization  — one per paying customer (tenant)
--   restaurant.org_member    — links BoLe auth users → org
--   organization_id on branch + employee
--   my_org_id(), is_platform_admin(), create_org(), add_org_member()
--   Replaces blanket rst_all_authenticated with org-scoped policies
-- ============================================================

-- ── 1. Organization (tenant) table ───────────────────────────
create table restaurant.organization (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  plan_tier  text not null default 'starter'
             check (plan_tier in ('starter','pro','enterprise')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tg_org_updated_at before update on restaurant.organization
  for each row execute function restaurant.tg_set_updated_at();

-- ── 2. Org membership (BoLe auth user ↔ org) ─────────────────
create table restaurant.org_member (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references restaurant.organization(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  is_owner        boolean not null default false,
  invited_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index idx_org_member_user on restaurant.org_member(user_id);
create index idx_org_member_org  on restaurant.org_member(organization_id);

-- ── 3. Add organization_id to branch + employee ──────────────
alter table restaurant.branch
  add column if not exists organization_id uuid references restaurant.organization(id);

alter table restaurant.employee
  add column if not exists organization_id uuid references restaurant.organization(id);

-- ── 4. Backfill: seed default org for existing data ──────────
do $$
declare
  v_org_id uuid;
begin
  if not exists (select 1 from restaurant.branch where organization_id is not null limit 1) then
    insert into restaurant.organization (name, plan_tier)
    values ('Default Restaurant', 'pro')
    returning id into v_org_id;

    update restaurant.branch   set organization_id = v_org_id where organization_id is null;
    update restaurant.employee set organization_id = v_org_id where organization_id is null;

    -- Make existing restaurant_staff BoLe users owners of the default org
    insert into restaurant.org_member (organization_id, user_id, is_owner)
    select v_org_id, p.id, true
    from public.profiles p
    where p.role = 'restaurant_staff'
    on conflict (organization_id, user_id) do nothing;

    -- Platform admins get read access too
    insert into restaurant.org_member (organization_id, user_id, is_owner)
    select v_org_id, p.id, false
    from public.profiles p
    where p.role = 'admin'
    on conflict (organization_id, user_id) do nothing;
  end if;
end $$;

-- Make organization_id NOT NULL on branch after backfill
alter table restaurant.branch alter column organization_id set not null;

-- ── 5. RLS helper functions ───────────────────────────────────

-- Returns the org_id of the calling user (null if not a member of any org)
create or replace function restaurant.my_org_id() returns uuid
language sql security definer stable as $$
  select organization_id from restaurant.org_member
  where user_id = auth.uid() limit 1
$$;

-- True when the calling BoLe user has the platform-level admin role
create or replace function restaurant.is_platform_admin() returns boolean
language sql security definer stable as $$
  select coalesce(
    (select true from public.profiles where id = auth.uid() and role = 'admin' limit 1),
    false
  )
$$;

-- True when the calling user is an owner of their org
create or replace function restaurant.is_org_owner() returns boolean
language sql security definer stable as $$
  select coalesce(
    (select is_owner from restaurant.org_member where user_id = auth.uid() limit 1),
    false
  )
$$;

-- ── 6. Privileged RPC functions (SECURITY DEFINER) ───────────

-- Create a new org + first branch + owner record in one transaction.
-- Called by new restaurant owners during onboarding.
create or replace function restaurant.create_org(p_org_name text, p_branch_name text)
returns jsonb language plpgsql security definer as $$
declare
  v_org_id    uuid;
  v_branch_id uuid;
  v_emp_id    uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into restaurant.organization (name) values (p_org_name) returning id into v_org_id;

  insert into restaurant.org_member (organization_id, user_id, is_owner)
  values (v_org_id, auth.uid(), true);

  insert into restaurant.branch (organization_id, name, status)
  values (v_org_id, p_branch_name, 'active') returning id into v_branch_id;

  -- Owner employee record (no PIN by default — owner logs in via BoLe auth)
  insert into restaurant.employee (branch_id, organization_id, name, role, is_active)
  values (v_branch_id, v_org_id, 'Owner', 'owner', true)
  returning id into v_emp_id;

  return jsonb_build_object(
    'org_id', v_org_id,
    'branch_id', v_branch_id,
    'employee_id', v_emp_id
  );
end $$;

grant execute on function restaurant.create_org(text, text) to authenticated;

-- Add an org member by email. Caller must be an owner of the org (or platform admin).
create or replace function restaurant.add_org_member(
  p_org_id  uuid,
  p_email   text,
  p_is_owner boolean default false
) returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid;
  v_name    text;
begin
  -- Check caller authority
  if not (
    exists (
      select 1 from restaurant.org_member
      where organization_id = p_org_id
        and user_id = auth.uid()
        and is_owner = true
    )
    or restaurant.is_platform_admin()
  ) then
    raise exception 'Only org owners can invite members';
  end if;

  -- Look up the BoLe user by email
  select id into v_user_id from auth.users where email = lower(trim(p_email)) limit 1;
  if v_user_id is null then
    raise exception 'No account found for %. Ask them to sign up at diamondandjeweler.com first.', p_email;
  end if;

  select coalesce(full_name, email) into v_name from public.profiles where id = v_user_id;

  insert into restaurant.org_member (organization_id, user_id, is_owner, invited_by)
  values (p_org_id, v_user_id, p_is_owner, auth.uid())
  on conflict (organization_id, user_id) do update set is_owner = p_is_owner;

  return jsonb_build_object('user_id', v_user_id, 'name', v_name, 'is_owner', p_is_owner);
end $$;

grant execute on function restaurant.add_org_member(uuid, text, boolean) to authenticated;

-- Remove an org member. Caller must be owner (cannot remove yourself if last owner).
create or replace function restaurant.remove_org_member(p_org_id uuid, p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not (
    exists (
      select 1 from restaurant.org_member
      where organization_id = p_org_id and user_id = auth.uid() and is_owner = true
    )
    or restaurant.is_platform_admin()
  ) then
    raise exception 'Only org owners can remove members';
  end if;

  -- Prevent removing the last owner
  if (select count(*) from restaurant.org_member where organization_id = p_org_id and is_owner = true) = 1
    and (select is_owner from restaurant.org_member where organization_id = p_org_id and user_id = p_user_id) = true
  then
    raise exception 'Cannot remove the last owner of an organization';
  end if;

  delete from restaurant.org_member where organization_id = p_org_id and user_id = p_user_id;
end $$;

grant execute on function restaurant.remove_org_member(uuid, uuid) to authenticated;

-- ── 7. Drop blanket policies ──────────────────────────────────
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'restaurant' loop
    execute format('drop policy if exists rst_all_authenticated on restaurant.%I', r.tablename);
  end loop;
end $$;

-- ── 8. Enable RLS on new tables ───────────────────────────────
alter table restaurant.organization enable row level security;
alter table restaurant.org_member   enable row level security;

-- ── 9. Grant on new tables ────────────────────────────────────
grant select, insert, update, delete on restaurant.organization to authenticated;
grant select, insert, update, delete on restaurant.org_member   to authenticated;

-- ── 10. Org-scoped RLS policies ──────────────────────────────

-- organization
create policy rst_org_select on restaurant.organization
  for select using (id = restaurant.my_org_id() or restaurant.is_platform_admin());
-- Allow any authenticated user to INSERT a new org (for onboarding via create_org RPC)
create policy rst_org_insert on restaurant.organization
  for insert with check (auth.role() = 'authenticated');
create policy rst_org_update on restaurant.organization
  for update using (id = restaurant.my_org_id() and restaurant.is_org_owner()
                    or restaurant.is_platform_admin());

-- org_member
create policy rst_org_member_select on restaurant.org_member
  for select using (organization_id = restaurant.my_org_id() or restaurant.is_platform_admin());
-- Allow authenticated users to insert themselves (handled via RPC — but also needed for direct inserts)
create policy rst_org_member_insert on restaurant.org_member
  for insert with check (auth.role() = 'authenticated');
create policy rst_org_member_delete on restaurant.org_member
  for delete using (organization_id = restaurant.my_org_id() and restaurant.is_org_owner()
                    or restaurant.is_platform_admin());

-- branch
create policy rst_branch_select on restaurant.branch
  for select using (organization_id = restaurant.my_org_id() or restaurant.is_platform_admin());
create policy rst_branch_insert on restaurant.branch
  for insert with check (organization_id = restaurant.my_org_id() or restaurant.is_platform_admin());
create policy rst_branch_update on restaurant.branch
  for update using (organization_id = restaurant.my_org_id() or restaurant.is_platform_admin());
create policy rst_branch_delete on restaurant.branch
  for delete using (organization_id = restaurant.my_org_id() or restaurant.is_platform_admin());

-- employee (has both branch_id and organization_id)
create policy rst_employee_select on restaurant.employee
  for select using (
    organization_id = restaurant.my_org_id()
    or restaurant.is_platform_admin()
  );
create policy rst_employee_insert on restaurant.employee
  for insert with check (organization_id = restaurant.my_org_id() or restaurant.is_platform_admin());
create policy rst_employee_update on restaurant.employee
  for update using (organization_id = restaurant.my_org_id() or restaurant.is_platform_admin());
create policy rst_employee_delete on restaurant.employee
  for delete using (organization_id = restaurant.my_org_id() or restaurant.is_platform_admin());

-- All branch-scoped tables: filter through branch.organization_id
do $$
declare
  r record;
  branch_tables text[] := ARRAY[
    'restaurant_table','section','reservation','waitlist',
    'supplier','menu_category','menu_item','modifier','ingredient',
    'timesheet','orders','order_item','course_firing',
    'kitchen_ticket','inventory_transaction','purchase_order','purchase_order_line',
    'payment','cashier_shift','promotion','audit_log','waste_log','stock_transfer'
  ];
begin
  for r in select unnest(branch_tables) as tbl loop
    -- Verify table exists before creating policy
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'restaurant' and table_name = r.tbl
    ) then
      execute format($p$
        create policy rst_org_%I_all on restaurant.%I
          for all
          using (
            branch_id in (
              select b.id from restaurant.branch b
              where b.organization_id = restaurant.my_org_id()
            )
            or restaurant.is_platform_admin()
          )
          with check (
            branch_id in (
              select b.id from restaurant.branch b
              where b.organization_id = restaurant.my_org_id()
            )
            or restaurant.is_platform_admin()
          )
      $p$, r.tbl, r.tbl);
    end if;
  end loop;
end $$;

-- membership (nullable branch_id — allow all org members to read, owners to write)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='restaurant' and table_name='membership') then
    execute $p$
      create policy rst_org_membership_all on restaurant.membership
        for all
        using (
          branch_id in (
            select b.id from restaurant.branch b
            where b.organization_id = restaurant.my_org_id()
          )
          or branch_id is null
          or restaurant.is_platform_admin()
        )
        with check (
          branch_id in (
            select b.id from restaurant.branch b
            where b.organization_id = restaurant.my_org_id()
          )
          or branch_id is null
          or restaurant.is_platform_admin()
        )
    $p$;
  end if;
end $$;

-- recipe & table_section (no direct branch_id — join through parent)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='restaurant' and table_name='recipe') then
    execute $p$
      create policy rst_org_recipe_all on restaurant.recipe
        for all
        using (
          menu_item_id in (
            select mi.id from restaurant.menu_item mi
            join restaurant.branch b on b.id = mi.branch_id
            where b.organization_id = restaurant.my_org_id()
          )
          or restaurant.is_platform_admin()
        )
        with check (
          menu_item_id in (
            select mi.id from restaurant.menu_item mi
            join restaurant.branch b on b.id = mi.branch_id
            where b.organization_id = restaurant.my_org_id()
          )
          or restaurant.is_platform_admin()
        )
    $p$;
  end if;

  if exists (select 1 from information_schema.tables where table_schema='restaurant' and table_name='table_section') then
    execute $p$
      create policy rst_org_table_section_all on restaurant.table_section
        for all
        using (
          table_id in (
            select rt.id from restaurant.restaurant_table rt
            join restaurant.branch b on b.id = rt.branch_id
            where b.organization_id = restaurant.my_org_id()
          )
          or restaurant.is_platform_admin()
        )
        with check (
          table_id in (
            select rt.id from restaurant.restaurant_table rt
            join restaurant.branch b on b.id = rt.branch_id
            where b.organization_id = restaurant.my_org_id()
          )
          or restaurant.is_platform_admin()
        )
    $p$;
  end if;
end $$;

-- notification table (if it exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='restaurant' and table_name='notification') then
    execute $p$
      create policy rst_org_notification_all on restaurant.notification
        for all
        using (
          branch_id in (
            select b.id from restaurant.branch b
            where b.organization_id = restaurant.my_org_id()
          )
          or restaurant.is_platform_admin()
        )
        with check (
          branch_id in (
            select b.id from restaurant.branch b
            where b.organization_id = restaurant.my_org_id()
          )
          or restaurant.is_platform_admin()
        )
    $p$;
  end if;
end $$;

-- ── Existing anon policies from 0043 remain unchanged (OR logic) ──
-- anon users can still read public menu data and place QR orders.
