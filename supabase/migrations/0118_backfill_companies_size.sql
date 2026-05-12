-- 0118_backfill_companies_size.sql
--
-- Migration 0112 tightened companies.size to the categorical set
-- ('startup','sme','mnc','enterprise','govt','ngo') but was added NOT VALID,
-- leaving legacy headcount-bucket values ('1-10','11-50','51-200','201-500','500+')
-- in place. Any subsequent UPDATE on those rows (e.g. admin verify) re-validates
-- the row and fails the CHECK. The signup form was also still writing the old
-- buckets, so every new company also tripped the constraint.
--
-- This migration: (1) normalises every legacy size value to a categorical atom,
-- (2) promotes the CHECK constraint to VALIDATED so future ALTERs don't leave
-- the same NOT VALID footgun.
--
-- Mapping is approximate — headcount range isn't a perfect proxy for
-- startup/sme/mnc/enterprise, but the matcher uses company_size as a soft
-- signal only. HR Admins can correct from the dashboard once that UI lands.

update public.companies
   set size = case
     when size = '1-10'                 then 'startup'
     when size in ('11-50','51-200')    then 'sme'
     when size = '201-500'              then 'mnc'
     when size = '500+'                 then 'enterprise'
     else null
   end
 where size is not null
   and size not in ('startup','sme','mnc','enterprise','govt','ngo');

-- All rows now conform — promote the constraint to validated.
alter table public.companies
  validate constraint companies_size_check;
