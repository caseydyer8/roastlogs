-- Migration: add live bean-temp curve to roasts
-- Date: 2026-08-20   (applied via Supabase apply_migration: add_curve_to_roasts)
--
-- WHY: Phase-1 RoastLink integration. RoastLogs captures the live bean-temp
-- stream between START and COOLING START and saves it with the roast. Stored as
-- jsonb: an array of { t: roast-elapsed seconds, bt: degF }, downsampled to ~1Hz.
--
-- SAFETY: additive and nullable. Existing roasts are untouched (curve = NULL);
-- no backfill, no rewrite. Reversible with: ALTER TABLE public.roasts DROP COLUMN curve;
-- RLS is unaffected — the column inherits the table's admin-only + aal2 policies.
-- The bridge never writes here; only the authenticated app does, on save.

ALTER TABLE public.roasts ADD COLUMN IF NOT EXISTS curve jsonb;
