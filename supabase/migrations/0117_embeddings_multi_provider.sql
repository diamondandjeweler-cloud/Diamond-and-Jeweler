-- 0117_embeddings_multi_provider.sql
--
-- Phase 3.5: multi-provider embedding chain. Adds provider + dim tags so
-- vectors from different free embedding providers (Gemini, Voyage, Cohere,
-- Mistral, Together, Cloudflare, Jina, Nomic, HuggingFace, OpenAI) can
-- coexist in the same table.
--
-- Critical: vectors from different providers live in DIFFERENT semantic
-- spaces and CANNOT be cosine-compared. compare_nn_concerns is updated
-- to only match rows where BOTH sides share the same provider AND the
-- same dim. If a role's atoms were embedded by Gemini and a talent's by
-- Voyage, they won't semantically match (matcher falls back to "unverified
-- for human review" — same graceful behaviour as no embeddings).
--
-- Table is currently empty (verified earlier in the audit), so drop+recreate
-- of the embedding column has no data loss.

-- Drop the v1 fixed-1536-dim column and its indexes
drop index if exists idx_nn_atom_embed_role_cosine;
drop index if exists idx_nn_atom_embed_talent_cosine;

alter table public.nn_atom_embeddings drop column if exists embedding;

-- Re-add as variable-dim vector (pgvector supports `vector` without dim)
alter table public.nn_atom_embeddings
  add column embedding vector,
  add column provider  text not null default 'unknown',
  add column dim       int  not null default 0;

comment on column public.nn_atom_embeddings.provider is
  'Which embedding provider produced this vector (gemini, voyage, cohere, ...). Vectors are only compared with rows of the same provider.';
comment on column public.nn_atom_embeddings.dim is
  'Cached vector_dims(embedding). Filter predicate alongside provider so pgvector never tries to <=> two different-dim vectors.';

-- Indexes:
--   Per-(provider, dim) ivfflat would be ideal but pgvector requires fixed
--   dim per index. Skip the cosine index for now — sequential scan within a
--   single (role,talent) pair is fast (max ~10 atoms per side). Revisit if
--   the table grows past 100k rows.
create index if not exists idx_nn_atom_embed_owner_v2
  on public.nn_atom_embeddings (owner_type, owner_id);

create index if not exists idx_nn_atom_embed_provider
  on public.nn_atom_embeddings (provider, dim);

-- Drop and recreate compare_nn_concerns. The new version:
--   • requires BOTH sides to share the same provider AND dim
--   • returns provider/dim in the result so the matcher can audit which
--     vector space produced each "satisfied" hit
drop function if exists public.compare_nn_concerns(uuid, uuid);

create or replace function public.compare_nn_concerns(
  p_role_id   uuid,
  p_talent_id uuid
)
returns table (
  side             text,
  atom_index       int,
  atom_text        text,
  match_text       text,
  cosine_distance  real,
  provider         text,
  dim              int
)
language sql stable as $$
  -- Role-side atoms vs nearest talent atom (same provider+dim only)
  select
    'role'::text as side,
    e.atom_index,
    e.text as atom_text,
    nn.text as match_text,
    nn.cosine_distance,
    e.provider,
    e.dim
  from public.nn_atom_embeddings e
  left join lateral (
    select t.text, (t.embedding <=> e.embedding)::real as cosine_distance
    from public.nn_atom_embeddings t
    where t.owner_type = 'talent'
      and t.owner_id   = p_talent_id
      and t.provider   = e.provider
      and t.dim        = e.dim
    order by t.embedding <=> e.embedding
    limit 1
  ) nn on true
  where e.owner_type = 'role' and e.owner_id = p_role_id

  union all

  -- Talent-side atoms vs nearest role atom (same provider+dim only)
  select
    'talent'::text as side,
    e.atom_index,
    e.text as atom_text,
    nn.text as match_text,
    nn.cosine_distance,
    e.provider,
    e.dim
  from public.nn_atom_embeddings e
  left join lateral (
    select r.text, (r.embedding <=> e.embedding)::real as cosine_distance
    from public.nn_atom_embeddings r
    where r.owner_type = 'role'
      and r.owner_id   = p_role_id
      and r.provider   = e.provider
      and r.dim        = e.dim
    order by r.embedding <=> e.embedding
    limit 1
  ) nn on true
  where e.owner_type = 'talent' and e.owner_id = p_talent_id
$$;

grant execute on function public.compare_nn_concerns(uuid, uuid) to service_role;

-- nearest_nn_atom: drop (was bound to vector(1536), now incompatible)
drop function if exists public.nearest_nn_atom(vector(1536), text, uuid);
