-- Add restaurant_staff role for accounts that only access the Restaurant OS module.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('talent','hiring_manager','hr_admin','admin','restaurant_staff'));
