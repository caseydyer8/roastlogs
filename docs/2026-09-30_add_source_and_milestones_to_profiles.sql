-- Migration: add public.roast_profiles.source_roast_id and .milestones (v3.9.0)
-- Date: 2026-09-30   (migration name for apply_migration: add_source_and_milestones_to_profiles)
--
-- WHY: a profile can now be saved from a finished roast. It records which roast
-- it came from (source_roast_id) and the milestones that roast hit
-- (milestones: [{label, t, temp}]). The live chart draws the source roast's
-- bean-temp curve and milestone markers as a ghost to roast against, and a later
-- History edit of that roast offers to update the profile. The curve is read from
-- the roast, not copied here. See docs/roast-setup-screen-plan.md §9.
--
-- No foreign key on source_roast_id, deliberately: deleting the source roast must
-- not fail or cascade; the profile keeps its steps and milestones and simply
-- loses its ghost curve.
--
-- SAFE + ADDITIVE: two nullable / defaulted columns. No existing row is read,
-- rewritten or deleted; every existing profile has no source and no milestones.
-- No RLS change -- the four admin + aal2 policies on roast_profiles are untouched
-- and new columns inherit them.
--
-- ORDER MATTERS: apply this BEFORE deploying v3.9.0. The client upsert names both
-- columns, and PostgREST rejects an unknown column (PGRST204), so a v3.9.0 client
-- against an unmigrated table fails EVERY profile sync (profiles still save
-- locally and the sync indicator shows the error).
--
-- Rollback: alter table public.roast_profiles drop column source_roast_id, drop column milestones;

alter table public.roast_profiles
  add column if not exists source_roast_id bigint,
  add column if not exists milestones jsonb default '[]'::jsonb;

comment on column public.roast_profiles.source_roast_id is
  'App id of the roast this profile was saved from; null for hand-built profiles.';
comment on column public.roast_profiles.milestones is
  'Milestones the source roast hit: [{label, t (seconds), temp (F or null)}]. Empty for hand-built profiles.';
