-- Migration: create public.beans table + RLS policies (applied 2026-07-18 via
-- Supabase MCP, migration name: create_beans_table)
--
-- Why: the Beans tab was reworked in v1.3.0 (Phase A) into a full inventory
-- repository — region, producer, variety, process, altitude, sourced-from,
-- bagged name, tasting notes, and an auditable weight-adjustment ledger —
-- but stayed localStorage-only, unlike roasts and tasting_notes which already
-- sync. This migration adds a beans table so bean records survive device
-- loss/reinstall the same way roasts/tasting notes already do. This is a
-- from-scratch table (no beans table or data existed before this).
--
-- id is a plain bigint (no identity/auto-generation) — the app always
-- supplies its own Date.now()-based id explicitly on upsert, same as
-- roasts.id and tasting_notes' pattern.
--
-- weight_adjustments is jsonb (array of {id, date, delta, reason}) — same
-- pattern as roasts.roast_log/starting_settings/profile already being jsonb.
--
-- Beans have no photo field today, so no photo-stripping concern (unlike
-- roasts/tasting notes, which strip photo fields client-side before sync).
--
-- RLS: enabled with the same single-user-by-design 4-policy block used for
-- roasts/tasting_notes (USING (true)/WITH CHECK (true), no user_id column) —
-- duplicated per docs/enable_rls.sql's own "duplicate this block for new
-- tables" instruction.
-- Verified after applying: RLS enabled, policies present, anon access
-- rejected, a round-trip insert/select of a bean with a weight_adjustments
-- array preserves the jsonb structure intact.

CREATE TABLE public.beans (
  id bigint PRIMARY KEY,
  name text NOT NULL,
  bagged_name text,
  origin text,
  region text,
  producer text,
  variety text,
  process text,
  masl numeric,
  sourced_from text,
  tasting_targets text,
  purchase_date text,
  purchase_weight numeric,
  weight_adjustments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.beans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read beans"
  ON public.beans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert beans"
  ON public.beans FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update beans"
  ON public.beans FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete beans"
  ON public.beans FOR DELETE
  TO authenticated
  USING (true);
