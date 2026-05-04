-- Add 'pending_approval' to the matches.status CHECK constraint.
-- Migration 0064 added the approval queue state machine and RLS but forgot
-- to extend this constraint, so any INSERT with status='pending_approval'
-- was rejected by Postgres before even reaching the application layer.

alter table public.matches
  drop constraint if exists matches_status_check;

alter table public.matches
  add constraint matches_status_check check (status in (
    'pending_approval',
    'generated','viewed','accepted_by_talent','declined_by_talent',
    'invited_by_manager','declined_by_manager','hr_scheduling',
    'interview_scheduled','interview_completed','offer_made',
    'hired','expired'
  ));
