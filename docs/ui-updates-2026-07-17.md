# UI Updates — Approved Build Spec — 2026-07-17

**Status: approved to implement. Test on `localhost:3000` first; do NOT push or
deploy until Casey approves the local build.** This is the actionable,
Casey-reviewed spec. It supersedes and narrows the round-1 exploration in
`docs/latest-ui-updates-2026-07-11.md` (read that for the taste-skill design
rationale, dial settings, and full locked-constraints list — not repeated in
full here).

Point Claude Code at this file: "read `docs/ui-updates-2026-07-17.md` and
implement it."

## Origin

Casey reviewed a consolidated whole-app taste-skill mockup and gave concrete
per-screen edits. The taste-skill direction is the chosen base. This spec is
those mockups minus the pieces Casey cut, plus his specific refinements. Two
decisions confirmed during review:
- Live roast: tap the Fan/Heat/Temp values in the timer to adjust **and** keep
  the floating "+" button (two large touch targets — Casey has larger fingers
  and wants forgiving targets).
- Brew summary: one combined dark "bag label" card (not two).

## Non-negotiable locks (unchanged from round 1, apply to every screen)

- Control order **Fan → Heat → Temp** everywhere.
- `zinc-950` background / `amber-500` single accent. Dark-only — no light mode.
- Phase labels exactly: `START` / `YELLOWING` / `FIRST CRACK` / `COOLING START`.
- Heat/Fan stay discrete 1–9 dials; chart step lines stay `type="stepAfter"`.
- Two-tier radius system (`rounded-3xl` cards / `rounded-2xl` tiles).
- **Display-order changes must never require data migration** — always read log
  entries by field name (`entry.fan` / `entry.heat` / `entry.temp`).

---

## 1. Roast tab — Session setup (pre-roast state, `App.js` ~1852–1957)

Applies when `elapsedSeconds === 0 && !isTimerRunning`.

- **Fan/Heat/Temp starting values** (`startingFan` / `startingHeat` /
  `startingTemp`) render using the **same cockpit-tile component** as the live
  roast screen (section 2) — one shared visual, not two lookalikes. Keep them
  editable (they set the `starting*` state that seeds the `start_settings` log
  entry in `startRoast`, ~1356–1362). Order stays Fan → Heat → Temp.
- **Group the bean fields** (Bean Name, Green Weight, Target Roast Level) under
  one labeled "Bean" card instead of a flat stack of same-weight cards.
- **Build Profile card** (~1932–1957): keep as-is, light spacing retouch only.

## 2. Roast tab — Live cockpit (`App.js` ~1959–2254)

- **Hero timer card:** the big `formatTime(elapsedSeconds)` timer (already
  ~1959–1975) plus the **most-recently-logged Fan/Heat/Temp** shown inside the
  same card (derive from the latest `adjustment` / `start_settings` entry in
  `roastLog`, or the live `heat`/`fan`/`temp` state). Keep the DEV timer and
  Running/Paused indicator.
- **Do NOT add a separate Fan/Heat/Temp tile row.** The mockup showed both a
  hero readout and a standalone tile row — that duplication is exactly what
  Casey flagged. The hero readout is the only F/H/T display on this screen.
- **Tap-to-adjust:** tapping any of the hero Fan/Heat/Temp values opens the
  existing adjustment logger popup (`isAdjPopupOpen`, ~2182–2254),
  **pre-filled** with the current values (nice-to-have: focus the tapped
  field's numpad). **Keep the floating "+" button** (~2165–2180) as a second
  entry to the same popup. Both must remain ≥44px targets. Each saved
  adjustment still appends a timestamped `roastLog` entry via
  `handleLogAdjustment` — do not change that data flow.
- **Phase Milestones (~1977–2044):** adopt taste-skill **colors/state** — logged
  milestones fill amber (state shown in form, not just text) — but **keep the
  current app's button spacing/layout**, NOT the compressed single pill row from
  the mockup. Casey specifically wants the roomier large-target arrangement
  (START full-width, YELLOWING / FIRST CRACK as a comfortable pair, COOLING
  START full-width). **Keep the START→PAUSE toggle** (the primary button
  switches label/behavior once the roast is running).
- **Roast Timeline (~2100–2163):** adopt the compressed, color-barred list from
  the mockup (amber bar = phase entry, gray bar = adjustment) so more entries
  fit without the "wall of dividers." Keep `F: · H: · T:` on adjustment rows.

## 3. Profile Builder (`App.js` ~569–814) — taste-skill as mocked, minus preview

Casey approved the mockup for this screen. Build it: inline –/+ steppers for
Fan and Heat (replacing per-value `DrumRollPicker` wheels), one compact `MM:SS`
time chip per step, and the visible "sorted by time" caption.

- **Omit the preview strip entirely.** Cut during review: it duplicated the step
  list's exact numbers as an unreadable bar shape, and profiles here run ~3–6
  steps, so it wasn't earning its space.
- **Drag-to-reorder handle:** aspirational only, NOT implemented today. Skip it
  unless Casey scopes real drag-and-drop separately. Steps still auto-sort by
  `totalSeconds` on save (`handleSave` ~686–700) — do not change that.
- Fan/Heat remain 1–9 discrete; no temp field is added. No data-shape change to
  the profile object.

## 4. History tab (`App.js` ~2816–3252)

Adopt the taste-skill row treatment, with one data change Casey requested:

- **Row content:** roast-level color accent bar (semantic roast color, distinct
  from the amber brand accent — see round-1 doc for the tan→dark stops), bean
  name, **date only** as the sub-line, duration, and the roast-level chip.
  **Remove the Fan/Heat/Temp summary** the mockup put on the row — Casey doesn't
  want F/H/T here. (The original sparkline is already being replaced, so the
  sub-line becomes just the date.)
- **Delete confirmation:** replace the native `window.confirm()` in
  `handleDeleteRoast` (~1503) with the app's existing styled discard-modal
  pattern (the one used for discarding an in-progress roast).
- **Empty states:** distinct copy for "no roasts yet" (with a CTA to the Roast
  tab) vs "no results for this search."
- Everything else in the History build-out: keep as taste-skill mocked.

## 5. Brew tab (`App.js` ~2286–2814; save at ~1640–1695)

### 5a. Remove the photo feature (brew-only, local-only)
- Remove the photo picker UI from Brew setup (the dashed upload button + preview
  + remove button, incl. handlers at ~2434 / ~2442) and the photo shown on the
  summary step.
- Remove `photo: brewPhoto` from the `newBrew` object (~1651) and the
  `brewPhoto` / `brewPhotoDataUrl` / `brewPhotoError` state (~932–934) and the
  brew-photo load effect (~1005–1021).
- The IndexedDB helpers (`savePhotoLocally` / `getPhotoLocally` /
  `deletePhotoLocally`, ~953–999) are only used by photos — remove the brew
  usage. Leave the helpers only if the tasting-note delete path (~1545) still
  references them for old records; otherwise remove them too. Prefer full
  removal if nothing else uses them.
- **Existing brews that already have a `photo` key:** stop displaying it. Their
  orphaned IndexedDB blobs are harmless and can be ignored (optional one-time
  cleanup later — not required). Do not crash on `selectedTastingNote.photo`
  being present; just don't render it.
- **Sync is unaffected:** `syncService.js` `stripPhotoFields` already deletes
  `photo`/`image`/`photoKey`/`brewPhoto`/`base64` before upsert, so no photo
  ever reached Supabase. No schema change for photo removal.

### 5b. Setup step — taste-skill grouping
Group into "Session" (linked roast + bean name) and "Parameters" (method/grind
as cockpit-style tiles, ratio as one-tap quick-select chips
`1:15 / 1:16 / 1:17 / Custom`, water temp labeled field). As mocked.

### 5c. Summary step — one combined dark "bag label" card (replaces the white card)
- The step-4 summary currently renders on a **white background**
  (`bg-white ... text-zinc-950`, ~2708–2812) — the only light surface in the
  app. Rebuild it in the dark/amber system: one card with a dashed amber rule
  top/bottom evoking a printed label, containing bean name, method line
  (`V60 · 1:16 · 205°F`), flavor descriptors, star rating, and brew-again.
- **Free-text notes:** keep the existing "Free Notes" `textarea` (~2786–2789) as
  a **separate labeled field below** the summary card, restyled to the
  labeled-field pattern. (It already exists and already saves as `notes` — do
  not drop it.)

### 5d. Half-star ratings (input + display + DATABASE — read 5e carefully)
- **Input** (~2755–2766): replace the 5 whole-star buttons with a half-star
  control. Recommended pattern: each of the 5 stars has two half-width tap
  zones — left tap = `x.5`, right tap = `x.0` — rendered as full / half / empty
  using a half-fill (clipPath or two overlaid polygons, or a linear-gradient
  fill stop at 50%). `brewRating` (~1133) now holds 0.5 increments (e.g. 3.5).
- **Display:** update **every** place a rating renders as stars to show halves
  (search the star polygon SVG and any `★`/`☆` glyphs). Bean average rating
  already uses `.toFixed(1)` (~3504) and displays a number — that stays fine;
  just ensure any star-glyph rendering supports half-fill.
- **Backward compatibility:** existing integer ratings (e.g. `4`) are valid
  half-star values (`4.0`) — no data migration of existing records needed for
  the app layer.

### 5e. DATABASE — the one change that can break persistence
`syncBrewToSupabase` writes `rating: cleanBrew.rating` to the `tasting_notes`
table (`syncService.js` ~87). **If that column is an integer type, writing 3.5
will error or silently truncate to 3 — data loss.**

Required before shipping half-stars:
1. Use the Supabase MCP (`list_tables` / `execute_sql`) to check the `rating`
   column type on `tasting_notes`.
2. If it is `integer`/`int4`/`int8`, apply a migration to a decimal type
   (`numeric(2,1)` is ideal — allows 0.0–5.0 in 0.5 steps; `real`/`float4` also
   works). Existing integer values cast cleanly (`4` → `4.0`).
3. Confirm a round-trip: save a brew rated 3.5 locally → verify it upserts to
   Supabase as `3.5` → `fetchBrewsFromSupabase` returns `3.5` → reload renders
   3.5 stars. This round-trip test is a hard gate for this feature.
4. Any migration is a schema change to an RLS-protected table — see Security.

## 6. Beans tab (`App.js` ~3438–3958)

Adopt the taste-skill list rows: amber-ringed monogram avatar (beans have no
photo field — honest fallback), origin under the name, roast/tasting counts as
pills. Ensure the average-rating display supports half-stars (5d). No other
data changes; beans stay local-only (matches CLAUDE.md).

---

## Data integrity & backward compatibility checklist

- [ ] Old roasts/brews (integer ratings, some with `photo` keys) still load and
      render without errors.
- [ ] Removing photo does not change any Supabase schema (photo was never
      synced).
- [ ] `rating` column migrated to a decimal type; 3.5 round-trips through
      Supabase intact.
- [ ] No display-order change reads log entries by array index — all by field
      name.
- [ ] Backup export (`appVersion` block in `App.js`) still exports/imports
      brews correctly with decimal ratings and without the `photo` field.

## Security (Casey's explicit requirement — run the built-in tooling)

The brew changes touch the Supabase write path and require a schema migration to
`tasting_notes` (an RLS-protected table), so a security pass is mandatory before
commit — this is exactly the CLAUDE.md trigger for it.

- [ ] Run the **security-auditor** agent after the changes are staged.
- [ ] Run **`/rls-audit`** (or the `rls-audit` skill) and confirm RLS is still
      **enabled and enforced** on `tasting_notes` and `roasts` after any
      migration — anon read returns `[]`, anon write rejected (42501).
- [ ] Confirm no secrets/keys entered the diff and `.gitignore` is still
      hardened (no `.env`, no service keys). The Supabase anon key in client
      code is expected/public; the service-role key must never be committed.
- [ ] Migration SQL, if any, goes in `docs/` (e.g. alongside `enable_rls.sql`)
      and must not disable or bypass RLS.

## Verification on localhost (do this before telling Casey it's ready)

1. `CI=false npm run build` succeeds (CI=false so warnings don't fail it).
2. `npm start`, open `localhost:3000`.
3. Drive the real flows — don't just eyeball:
   - Start a roast, tap a hero Fan/Heat/Temp value → logger opens pre-filled →
     save → entry appears in timeline; repeat via the "+" button. Confirm
     START→PAUSE toggles.
   - Build a profile with steppers; save; start a roast following it.
   - Log a brew end-to-end with a **3.5-star** rating and no photo; save;
     reload; confirm 3.5 renders and the summary card is dark. Then confirm the
     Supabase round-trip from 5e.
   - Open History (rows show date, no F/H/T; delete uses the styled modal) and
     Beans (monogram rows, half-star averages).
4. Run **`/ui-loop`** — update/extend visual baselines for the changed screens
   (Roast, Profile Builder, History, Brew summary, Beans).
5. Suggest **`/code-review`** on the diff.

## Shipping (SEPARATE — only after Casey approves the local build)

Do not bundle this into the implementation. When Casey approves:
- Use **`/release`** (handles the 3-place version bump: `package.json`, the
  About-modal badge, and the backup-export `appVersion`), build, commit, push,
  and `npm run deploy`.
- Spawn the **deploy-verifier** agent — never call the deploy done on
  "Published" alone. Remind that the Pages CDN takes 1–2 min (hard refresh /
  private window).

## Out of scope (do not change)

- `RoastCurveChart.jsx` — already well-designed; leave it.
- Login screen and Settings/About modal — not part of this round.
- Supabase RLS policy design (single-user by design) — audit only, don't alter.
- Any roast/bean data shapes beyond what's specified above.
