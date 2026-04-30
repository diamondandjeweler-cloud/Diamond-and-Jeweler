-- ============================================================
-- BoLe Platform — Support Tickets / User Feedback
-- Lets any authenticated user file an issue or feedback;
-- admins triage and reply. Single-reply v1 (no threading).
-- ============================================================

-- ---------- table ----------

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (
    category in ('bug','feedback','account','payment','feature_request','other')
  ),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 5000),
  status text not null default 'open' check (
    status in ('open','in_progress','resolved','closed')
  ),
  priority text not null default 'normal' check (
    priority in ('low','normal','high','urgent')
  ),
  admin_reply text,
  replied_by uuid references auth.users(id) on delete set null,
  replied_at timestamptz,
  attachment_url text,
  user_agent text,
  page_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_tickets_user_created
  on public.support_tickets(user_id, created_at desc);
create index if not exists idx_support_tickets_status
  on public.support_tickets(status);
create index if not exists idx_support_tickets_category
  on public.support_tickets(category);

create trigger tg_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.tg_set_updated_at();

-- ---------- RLS ----------

alter table public.support_tickets enable row level security;

-- Authenticated users can read their own tickets; admins can read all.
drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own on public.support_tickets
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Authenticated users can create tickets for themselves only.
drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets
  for insert to authenticated
  with check (user_id = auth.uid());

-- Owners can edit their own ticket only while still 'open' (e.g. fix a typo).
-- They cannot change status/admin_reply/replied_by/replied_at — those remain
-- admin-only via a column-level guard in the UPDATE check below.
drop policy if exists support_tickets_update_own on public.support_tickets;
create policy support_tickets_update_own on public.support_tickets
  for update to authenticated
  using (user_id = auth.uid() and status = 'open')
  with check (user_id = auth.uid());

-- Admins can update anything.
drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update_admin on public.support_tickets
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Only admins can delete.
drop policy if exists support_tickets_delete_admin on public.support_tickets;
create policy support_tickets_delete_admin on public.support_tickets
  for delete to authenticated
  using (public.is_admin());

-- ---------- column-level guard ----------
-- Prevent ticket owners from sneaking in admin-only column changes via the
-- "update_own" policy. Triggered before update; allows passthrough for admins
-- and for inserts of those values. (Owners can still rewrite subject/message
-- while status='open'.)

create or replace function public.tg_support_tickets_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Non-admin (i.e. ticket owner): block changes to admin-managed columns.
  if new.status         is distinct from old.status         or
     new.priority       is distinct from old.priority       or
     new.admin_reply    is distinct from old.admin_reply    or
     new.replied_by     is distinct from old.replied_by     or
     new.replied_at     is distinct from old.replied_at     or
     new.user_id        is distinct from old.user_id        or
     new.created_at     is distinct from old.created_at then
    raise exception 'support_tickets: only admins may modify status, priority, or reply fields';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_support_tickets_owner_guard on public.support_tickets;
create trigger tg_support_tickets_owner_guard
  before update on public.support_tickets
  for each row execute function public.tg_support_tickets_owner_guard();

-- ---------- attachments bucket ----------
-- Private bucket; up to 5 MB; common image types + PDF.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do nothing;

-- File path convention: {auth_uid}/{ticket_or_uuid}/{filename}
drop policy if exists support_attach_upload_own on storage.objects;
create policy support_attach_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists support_attach_read_own on storage.objects;
create policy support_attach_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists support_attach_read_admin on storage.objects;
create policy support_attach_read_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and public.is_admin()
  );

drop policy if exists support_attach_delete_own on storage.objects;
create policy support_attach_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists support_attach_delete_admin on storage.objects;
create policy support_attach_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'support-attachments'
    and public.is_admin()
  );

-- ---------- in-app notification helpers ----------
-- Notify all admins on insert; notify ticket owner when admin replies.

create or replace function public.tg_support_ticket_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, channel, subject, body, data)
  select
    p.id,
    'support_ticket_new',
    'in_app',
    'New support ticket: ' || new.subject,
    left(new.message, 280),
    jsonb_build_object('ticket_id', new.id, 'category', new.category)
  from public.profiles p
  where p.role = 'admin' and p.is_banned = false;
  return new;
end;
$$;

drop trigger if exists tg_support_ticket_notify_admins on public.support_tickets;
create trigger tg_support_ticket_notify_admins
  after insert on public.support_tickets
  for each row execute function public.tg_support_ticket_notify_admins();

create or replace function public.tg_support_ticket_notify_owner_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.admin_reply is distinct from old.admin_reply
     and new.admin_reply is not null then
    insert into public.notifications (user_id, type, channel, subject, body, data)
    values (
      new.user_id,
      'support_ticket_reply',
      'in_app',
      'Support replied to: ' || new.subject,
      left(new.admin_reply, 280),
      jsonb_build_object('ticket_id', new.id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tg_support_ticket_notify_owner_on_reply on public.support_tickets;
create trigger tg_support_ticket_notify_owner_on_reply
  after update on public.support_tickets
  for each row execute function public.tg_support_ticket_notify_owner_on_reply();
