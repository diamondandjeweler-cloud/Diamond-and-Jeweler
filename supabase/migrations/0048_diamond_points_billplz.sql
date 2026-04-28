-- ============================================================
-- 0048 — Diamond Points earn rates, Billplz payment support,
--         per-profile referral codes, and points packages.
-- ============================================================

-- 1) Per-profile permanent referral code.
alter table public.profiles
  add column if not exists referral_code text unique;

-- Generate codes for existing profiles that don't have one.
do $$
declare
  r record;
  code text;
begin
  for r in select id from public.profiles where referral_code is null loop
    loop
      code := 'DNJ-' || upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 8));
      begin
        update public.profiles set referral_code = code where id = r.id;
        exit; -- success
      exception when unique_violation then
        -- retry with a new code
      end;
    end loop;
  end loop;
end $$;

-- Trigger: auto-assign referral_code on new profile INSERT.
create or replace function public.tg_assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  attempts int := 0;
begin
  if new.referral_code is not null then
    return new;
  end if;
  loop
    code := 'DNJ-' || upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 8));
    begin
      new.referral_code := code;
      return new;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 20 then
        raise exception 'Could not generate unique referral code after 20 attempts';
      end if;
    end;
  end loop;
end;
$$;

drop trigger if exists tg_profiles_assign_referral_code on public.profiles;
create trigger tg_profiles_assign_referral_code
  before insert on public.profiles
  for each row execute function public.tg_assign_referral_code();

-- 2) Update system_config earn rates and add new keys.
--    Use upsert so re-running is safe.

-- Referrer gets 19 pts, referee gets 5 pts welcome bonus.
insert into public.system_config (key, value) values
  ('points_per_referral',       to_jsonb(19)),
  ('points_referee_welcome',    to_jsonb(5)),
  -- Per-match earn triggers.
  ('earn_reject_with_reason',   to_jsonb(5)),
  ('earn_accept_interview',     to_jsonb(5)),
  ('earn_interviewer_rejects',  to_jsonb(5)),
  ('earn_end_review',           to_jsonb(5)),
  -- Redemption cost and free match quota.
  ('points_per_extra_match',    to_jsonb(21)),
  ('free_matches_quota',        to_jsonb(3)),
  -- Points packages: admin can edit this JSON array to add/remove/change packages.
  ('points_packages', to_jsonb('[
    {"id":"starter","name":"Starter","price_rm":39,"points":169},
    {"id":"value","name":"Value","price_rm":99,"points":499}
  ]'::jsonb))
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

-- 3) Flip default payment_provider on extra_match_purchases to billplz.
alter table public.extra_match_purchases
  alter column payment_provider set default 'billplz';
