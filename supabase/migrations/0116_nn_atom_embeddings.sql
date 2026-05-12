-- 0116_nn_atom_embeddings.sql
--
-- Phase 3 of structured matching: free_text atom embeddings. Lets the matcher
-- score talent-side and role-side free_text concerns against each other via
-- cosine similarity, instead of just surfacing them as "unverified for human
-- review".
--
-- Vector model: OpenAI text-embedding-3-small (1536-d).
-- Storage: separate table keyed by (owner, atom_index) so the atoms JSONB
-- stays clean and ivfflat indexing works.

create extension if not exists vector;

create table if not exists public.nn_atom_embeddings (
  id          bigserial primary key,
  owner_type  text        not null check (owner_type in ('role','talent')),
  owner_id    uuid        not null,
  atom_index  int         not null,
  text        text        not null,
  embedding   vector(1536) not null,
  created_at  timestamptz not null default now(),
  unique (owner_type, owner_id, atom_index)
);

-- Cosine-distance index. Lists tuning: ~sqrt(N) is the textbook default; we
-- pick 100 which is healthy up to ~10k vectors (one talent typically has
-- 0-3 free_text atoms; one role 0-5). Bump later via REINDEX if pool grows.
create index if not exists idx_nn_atom_embed_role_cosine
  on public.nn_atom_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where owner_type = 'role';

create index if not exists idx_nn_atom_embed_talent_cosine
  on public.nn_atom_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where owner_type = 'talent';

create index if not exists idx_nn_atom_embed_owner
  on public.nn_atom_embeddings (owner_type, owner_id);

-- RLS: role embeddings readable by service_role only; nothing else needs to
-- touch this table from the client. Mutations are server-side only.
alter table public.nn_atom_embeddings enable row level security;

drop policy if exists nn_atom_embed_admin on public.nn_atom_embeddings;
create policy nn_atom_embed_admin on public.nn_atom_embeddings
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Helper: nearest free_text atom on the OPPOSITE side for a given query
-- embedding. Used by match-core to score concerns_alignment.
--
-- p_query_embedding: embedding of the side we're checking from
-- p_other_owner_type: the OTHER side ('role' if querying for talent atoms,
--                     'talent' if querying for role atoms)
-- p_other_owner_id:   the OTHER side's row id (the role being matched OR
--                     the candidate talent being scored)
-- Returns the single closest neighbour by cosine distance. NULL distance =
-- no atoms on the other side.
create or replace function public.nearest_nn_atom(
  p_query_embedding vector(1536),
  p_other_owner_type text,
  p_other_owner_id uuid
)
returns table (text text, cosine_distance real)
language sql stable as $$
  select e.text, (e.embedding <=> p_query_embedding)::real as cosine_distance
  from public.nn_atom_embeddings e
  where e.owner_type = p_other_owner_type
    and e.owner_id   = p_other_owner_id
  order by e.embedding <=> p_query_embedding
  limit 1
$$;

grant execute on function public.nearest_nn_atom(vector(1536), text, uuid) to service_role;

-- compare_nn_concerns
--
-- For a (role, talent) pair, returns one row per free_text atom on either
-- side, paired with its nearest semantic neighbour on the other side.
-- Result columns:
--   side                — 'role' or 'talent' (which side this atom lives on)
--   atom_index          — atom's original index in the side's atoms array
--   atom_text           — verbatim text of this atom
--   match_text          — nearest neighbour text on the other side (NULL if none)
--   cosine_distance     — 0 = identical, 1 = unrelated, NULL when no neighbour
--
-- The matcher applies a threshold (cosine_distance <= 0.25 ≈ similarity ≥ 0.75)
-- to decide whether to count this atom as "satisfied" vs "unverified".
create or replace function public.compare_nn_concerns(
  p_role_id   uuid,
  p_talent_id uuid
)
returns table (
  side             text,
  atom_index       int,
  atom_text        text,
  match_text       text,
  cosine_distance  real
)
language sql stable as $$
  -- Role-side atoms vs nearest talent atom
  select
    'role'::text as side,
    e.atom_index,
    e.text as atom_text,
    nn.text as match_text,
    nn.cosine_distance
  from public.nn_atom_embeddings e
  left join lateral (
    select t.text, (t.embedding <=> e.embedding)::real as cosine_distance
    from public.nn_atom_embeddings t
    where t.owner_type = 'talent' and t.owner_id = p_talent_id
    order by t.embedding <=> e.embedding
    limit 1
  ) nn on true
  where e.owner_type = 'role' and e.owner_id = p_role_id

  union all

  -- Talent-side atoms vs nearest role atom
  select
    'talent'::text as side,
    e.atom_index,
    e.text as atom_text,
    nn.text as match_text,
    nn.cosine_distance
  from public.nn_atom_embeddings e
  left join lateral (
    select r.text, (r.embedding <=> e.embedding)::real as cosine_distance
    from public.nn_atom_embeddings r
    where r.owner_type = 'role' and r.owner_id = p_role_id
    order by r.embedding <=> e.embedding
    limit 1
  ) nn on true
  where e.owner_type = 'talent' and e.owner_id = p_talent_id
$$;

grant execute on function public.compare_nn_concerns(uuid, uuid) to service_role;
