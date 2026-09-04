-- Migration: add public.roasts.equipment (v3.7.0 — equipment field, Phase 1)
-- Date: 2026-09-03   (migration name for apply_migration: add_equipment_to_roasts)
--
-- WHY: every roast was logged as if the hardware never changed. It does — the
-- Razzo V5T's thicker glass carries more thermal mass, so the same fan/heat
-- settings produce a different curve than the OEM tube or the standard SR540.
-- Without recording which setup was used, a History comparison reads a hardware
-- change as a technique change. See docs/equipment-field-plan.md.
--
-- Shape (matches the app object exactly, see docs/roastlink-live-data-plan.md):
--   { setup: "razzo-v5t" | "oem-tube" | "sr540", probe: "k-type" | null }
--
-- `probe` is derivable from `setup` today. It is stored anyway so the Phase 2
-- capability gate (hide live mode when there is no probe) reads one field
-- instead of re-deriving the rule in a second place.
--
-- SAFE + ADDITIVE: one nullable column. No existing row is read, rewritten or
-- deleted; all existing roasts simply have no equipment and render as "Not
-- recorded". No RLS change — the 16 admin+aal2 policies are untouched, and a
-- new column inherits them automatically. Same shape as the `curve` column
-- added in v3.4.0.
--
-- Rollback: alter table public.roasts drop column equipment;

alter table public.roasts
  add column if not exists equipment jsonb;

comment on column public.roasts.equipment is
  'Roaster hardware used for this roast: {setup, probe}. Null for roasts logged before v3.7.0.';
