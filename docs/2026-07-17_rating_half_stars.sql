-- Migration: tasting_notes.rating integer → numeric(2,1)  (applied 2026-07-17 via Supabase MCP,
-- migration name: tasting_notes_rating_half_stars)
--
-- Why: the Brew tab now records half-star ratings (0.5 steps, e.g. 3.5). The rating column
-- was integer, so writing 3.5 would error or silently truncate to 3 — data loss.
-- numeric(2,1) allows 0.0–5.0 in 0.5 steps; existing integer values cast cleanly (4 → 4.0).
--
-- RLS: this migration does NOT touch row-level security or policies.
-- Verified after applying: RLS still enabled on tasting_notes and roasts,
-- and a 3.5 rating round-trips through insert/select intact.

ALTER TABLE public.tasting_notes
  ALTER COLUMN rating TYPE numeric(2,1) USING rating::numeric(2,1);

-- Follow-up (applied same day, migration name: tasting_notes_rating_range_check),
-- from the security audit: guard the rating range at the DB layer too.
-- Existing data verified in range before applying. No RLS/policy changes.
ALTER TABLE public.tasting_notes
  ADD CONSTRAINT tasting_notes_rating_range
  CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5));
