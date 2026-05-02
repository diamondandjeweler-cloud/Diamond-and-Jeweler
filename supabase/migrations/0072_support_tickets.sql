-- Support tickets for AI Support Officer chat
create table public.support_tickets (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id) on delete set null,
  category                text not null check (category in ('enquiry', 'bug', 'feature', 'payment')),
  payment_sub_type        text check (payment_sub_type in ('pending', 'failed', 'refund', 'wrong_amount', 'receipt')),
  summary                 text,
  transcript              jsonb not null default '[]',
  status                  text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_notes             text,
  payment_transaction_id  text,
  payment_amount          numeric,
  payment_status_snapshot text,
  created_at              timestamptz not null default now(),
  resolved_at             timestamptz
);

alter table public.support_tickets enable row level security;

-- Users can read and create their own tickets
create policy "support_tickets_user_select" on public.support_tickets
  for select using (auth.uid() = user_id);

create policy "support_tickets_user_insert" on public.support_tickets
  for insert with check (auth.uid() = user_id);

-- Admin can do everything
create policy "support_tickets_admin_all" on public.support_tickets
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Index for admin listing by status
create index support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index support_tickets_user_idx   on public.support_tickets (user_id, created_at desc);
