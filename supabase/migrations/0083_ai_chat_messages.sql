-- ============================================================
-- 0083 — AI chat message logging + analytics view
--
-- Persists every user/assistant turn from chat-support and
-- chat-onboard so we can:
--   1. Track per-user/per-day token spend (Anthropic, Groq, etc.)
--   2. Run analytics on what talents and HMs actually want
--      (free-text answers in onboarding are the primary signal).
--
-- Privacy: RLS restricts users to their own rows; admin sees all.
-- Service role inserts (Edge Functions). A Data Subject Request
-- delete cascades via user_id FK on profiles.
-- ============================================================

create table if not exists public.ai_chat_messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null,
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  endpoint        text        not null check (endpoint in ('chat-onboard','chat-support')),
  mode            text        check (mode in ('talent','hm')),
  role            text        not null check (role in ('user','assistant')),
  content         text        not null,
  provider        text,
  model           text,
  input_tokens    int,
  output_tokens   int,
  user_role       text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_chat_user_created
  on public.ai_chat_messages (user_id, created_at desc);
create index if not exists idx_ai_chat_conv
  on public.ai_chat_messages (conversation_id, created_at);
create index if not exists idx_ai_chat_endpoint_created
  on public.ai_chat_messages (endpoint, created_at desc);

alter table public.ai_chat_messages enable row level security;

drop policy if exists ai_chat_select_self on public.ai_chat_messages;
create policy ai_chat_select_self on public.ai_chat_messages
  for select using (user_id = auth.uid());

drop policy if exists ai_chat_admin_all on public.ai_chat_messages;
create policy ai_chat_admin_all on public.ai_chat_messages
  for all using (public.is_admin()) with check (public.is_admin());

-- Daily roll-up for cheap analytics queries (Asia/Kuala_Lumpur day boundaries).
create or replace view public.ai_chat_usage_daily as
  select
    date_trunc('day', created_at at time zone 'Asia/Kuala_Lumpur')::date as day_myt,
    user_id,
    user_role,
    endpoint,
    coalesce(provider, 'unknown') as provider,
    sum(coalesce(input_tokens, 0))                                 as input_tokens,
    sum(coalesce(output_tokens, 0))                                as output_tokens,
    sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0))    as total_tokens,
    count(*) filter (where role = 'user')                          as user_messages,
    count(*) filter (where role = 'assistant')                     as assistant_messages
  from public.ai_chat_messages
  group by 1, 2, 3, 4, 5;

grant select on public.ai_chat_usage_daily to authenticated;
