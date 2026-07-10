-- ============================================================================
-- 0180 — queue priority escalation + fail-closed HR company binding
--
-- Two adversarially-verified findings from the 2026-07-10 audit of the
-- async-matcher conversion (match-generate enqueue path) and 0179:
--
-- (a) enqueue_roles_for_rematch (0167) dedups via NOT EXISTS and never raises
--     an existing row's priority. An interactive priority-10 kick on a role
--     already pending at bulk priority 5 was silently skipped, so "interactive
--     kicks drain first" failed exactly under backlog — the situation the
--     priority split exists for. Fix: strictly-upgrade PENDING rows before the
--     INSERT. Restricted to status='pending' — processing rows are already
--     claimed, and touching their updated_at would stretch the 30-minute
--     stall window used by reset_stalled_match_queue (0074). Returned count
--     stays inserted-rows-only (existing `enqueued` semantics preserved).
--
-- (b) auth_hr_company_id() (0124, normalized in 0179) is a bare LIMIT 1 with
--     no ORDER BY. companies.primary_hr_email has NO unique constraint, so
--     once 0179 made case-variant bindings live, two companies normalizing to
--     the same email make the binding nondeterministic — an HR admin could be
--     silently scoped to the wrong company (locked out of their own
--     interviews AND granted FOR ALL on the other's). Fix: fail CLOSED —
--     return the company only when exactly one matches. Plus a guarded unique
--     index on lower(trim(primary_hr_email)) so a duplicate binding can never
--     be created (index only created if prod currently has no duplicates;
--     verified zero at apply time).
--
-- Idempotent: CREATE OR REPLACE + guarded DO blocks only.
-- ============================================================================

-- ---------- (a) enqueue_roles_for_rematch: escalate pending priority ----------

create or replace function public.enqueue_roles_for_rematch(
  p_role_ids uuid[],
  p_priority integer default 5
)
returns integer
language plpgsql
as $function$
declare
  v_count int;
begin
  -- Strict upgrade of already-pending rows (0180): a P10 interactive kick on a
  -- role sitting in the bulk P5 backlog must jump the queue, not no-op.
  update public.match_queue q
  set    priority   = p_priority,
         updated_at = now()
  where  q.role_id  = any(p_role_ids)
    and  q.status   = 'pending'
    and  q.priority < p_priority;

  insert into public.match_queue (role_id, priority)
  select r.id, p_priority
  from   public.roles r
  where  r.id = any(p_role_ids)
    and  r.status = 'active'
    and  (r.vacancy_expires_at is null or r.vacancy_expires_at > now())
    and  not exists (
      select 1 from public.match_queue q
      where  q.role_id = r.id
        and  q.status in ('pending','processing')
    )
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.enqueue_roles_for_rematch(uuid[], integer) from public, anon, authenticated;
grant execute on function public.enqueue_roles_for_rematch(uuid[], integer) to service_role;

-- ---------- (b1) auth_hr_company_id: fail closed on multi-match ----------

CREATE OR REPLACE FUNCTION public.auth_hr_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT CASE WHEN count(*) = 1 THEN min(c.id) END
  FROM public.companies c
  JOIN public.profiles p ON lower(trim(p.email)) = lower(trim(c.primary_hr_email))
  WHERE p.id = auth.uid()
    AND p.role = 'hr_admin';
$$;

comment on function public.auth_hr_company_id() is
  'RLS helper — SECURITY DEFINER. Company uuid the caller is HR admin of, or NULL — including NULL when the normalized email matches MORE than one company (fail closed, 0180; a variant/planted company must never silently capture the binding). Used by interviews_all_hr. See 0124/0179.';

-- ---------- (b2) unique index on normalized HR email (guarded) ----------
-- Only created when no duplicate normalized bindings exist; otherwise skipped
-- with a NOTICE so the apply never fails. (Non-CONCURRENT is fine: companies
-- is tiny at pilot scale and the Management API wraps this in one txn anyway.)

do $do$
begin
  if exists (
    select 1 from public.companies
    where primary_hr_email is not null
    group by lower(trim(primary_hr_email))
    having count(*) > 1
  ) then
    raise notice '0180: duplicate normalized primary_hr_email values exist — unique index SKIPPED; resolve duplicates then re-run';
  else
    create unique index if not exists uq_companies_hr_email_norm
      on public.companies (lower(trim(primary_hr_email)))
      where primary_hr_email is not null;
  end if;
end
$do$;

notify pgrst, 'reload schema';
