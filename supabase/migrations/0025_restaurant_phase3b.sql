-- ============================================================
-- Phase 3b — chef-presence menu rule
-- ============================================================

alter table restaurant.menu_item
  add column if not exists requires_chef boolean not null default false;

create or replace function restaurant.is_kitchen_on_duty(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = restaurant, public
as $$
  select exists (
    select 1
    from restaurant.timesheet ts
    join restaurant.employee e on e.id = ts.employee_id
    where ts.branch_id = p_branch_id
      and ts.clock_out is null
      and e.role in ('kitchen','shift_manager')
      and e.is_active = true
  );
$$;
