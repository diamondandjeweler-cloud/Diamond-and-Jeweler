-- ============================================================
-- BoLe Platform — Year-Luck (annual cycle by character)
--
-- 9-stage cycle. Each life-chart character enters stage 1 in a
-- different anchor year, then advances by one stage per year and
-- wraps after 9 years.
--
--   W=2026, E-=2027, W+=2028, W-=2029, E=2030,
--   G+=2031, G-=2032, E+=2033, F=2034
--
-- Stage texts live in the frontend (apps/web/src/lib/yearLuck.ts)
-- so they render instantly and i18n cleanly. The DB only owns the
-- formula so other server code (notifications, monthly-fortune,
-- BaZi composition) can join on stage too.
-- ============================================================

create or replace function public.year_luck_anchor(p_character text)
returns int language sql immutable as $$
  select case p_character
    when 'W'  then 2026
    when 'E-' then 2027
    when 'W+' then 2028
    when 'W-' then 2029
    when 'E'  then 2030
    when 'G+' then 2031
    when 'G-' then 2032
    when 'E+' then 2033
    when 'F'  then 2034
    else null
  end
$$;

create or replace function public.get_year_luck_stage(p_character text, p_year int)
returns int language sql immutable as $$
  select case
    when p_character is null or p_year is null then null
    when public.year_luck_anchor(p_character) is null then null
    else (((p_year - public.year_luck_anchor(p_character)) % 9 + 9) % 9) + 1
  end
$$;

grant execute on function public.year_luck_anchor(text) to authenticated, service_role;
grant execute on function public.get_year_luck_stage(text, int) to authenticated, service_role;
