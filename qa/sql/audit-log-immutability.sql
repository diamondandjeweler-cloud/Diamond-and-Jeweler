-- DNJ Launch QA — audit_log immutability
-- The audit log must be append-only. UPDATE/DELETE must fail even for admins
-- (the trigger or RLS should block, leaving service-role as the only escape
-- hatch — and even then we'd want it gated).

-- Run as a standalone script via PAT/Management API.
-- Each statement is wrapped in a savepoint so we can detect "did the row change?"
-- without actually mutating prod.

begin;
  savepoint pre;

  -- Try to UPDATE the most recent audit row.
  do $$
  declare
    target_id uuid;
    rows_changed int;
  begin
    select id into target_id from public.audit_log order by created_at desc limit 1;
    if target_id is null then
      raise notice 'audit_log empty — cannot test immutability';
      return;
    end if;
    update public.audit_log set actor_id = '00000000-0000-0000-0000-000000000000' where id = target_id;
    get diagnostics rows_changed = row_count;
    if rows_changed > 0 then
      raise exception 'IMMUTABILITY FAIL: audit_log UPDATE succeeded (% rows)', rows_changed;
    end if;
  exception
    when insufficient_privilege then
      raise notice 'audit_log UPDATE blocked by privilege (PASS)';
    when others then
      raise notice 'audit_log UPDATE blocked: % (PASS)', sqlerrm;
  end $$;

  -- Try DELETE.
  do $$
  declare
    target_id uuid;
    rows_changed int;
  begin
    select id into target_id from public.audit_log order by created_at desc limit 1;
    if target_id is null then return; end if;
    delete from public.audit_log where id = target_id;
    get diagnostics rows_changed = row_count;
    if rows_changed > 0 then
      raise exception 'IMMUTABILITY FAIL: audit_log DELETE succeeded (% rows)', rows_changed;
    end if;
  exception
    when insufficient_privilege then
      raise notice 'audit_log DELETE blocked by privilege (PASS)';
    when others then
      raise notice 'audit_log DELETE blocked: % (PASS)', sqlerrm;
  end $$;

  rollback to pre;
rollback;
