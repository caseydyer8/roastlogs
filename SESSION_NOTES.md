# Session Notes — 2026-05-29

Branch: `session/20260529-bugs-and-features` (off `develop`)
Recovery tag created locally: `snapshot-before-session-20260529` (on `main`)
Build status: ✅ `npm run build` compiles cleanly (no errors, no warnings).

> ⚠️ Two important environment notes before you review:
> 1. **Tag not pushed.** Phase 0B says to `git push origin --tags`. You asked me not to push, so the
>    recovery tag exists **locally only**. Push it yourself if you want it on the remote:
>    `git push origin snapshot-before-session-20260529`
> 2. **Nested `roastlogs/` clone.** There is an untracked nested `roastlogs/` directory at the repo root
>    that is a *separate* git clone (on `main`, an older 3506-line `App.js`). The real project I worked in
>    is the **top-level** repo (on `develop`, 3830-line `App.js`). The nested copy looks like leftover
>    clutter — recommend you delete it once you confirm nothing depends on it. I did **not** touch it.

---

## ✅ Completed

### BUG-003 — Brew photo validation (was PARTIALLY done)
The photo button already worked (file input → IndexedDB → thumbnail → remove), but the spec's
validation guards were missing. Added them.
- `src/App.js`: new `brewPhotoError` state; new `handleBrewPhotoSelect()` that rejects non-image
  types (allows jpeg/png/webp/heic, plus `.heic/.heif` by extension) and files > 5MB, shows an inline
  red error, and only then reads base64 → IndexedDB (never Supabase). Tightened `accept=` to the four
  types. Error clears on remove / brew reset.
- Comment: `// SECURITY: file type/size validated. Base64 in IndexedDB only, never Supabase.`

### IDEA-006 — Beans tab "Log a Session" button
- `src/App.js`: lifted `prefillBean` state to the App component (no localStorage handoff). Added a
  prominent amber **LOG A SESSION** button in Bean Detail's "Roast Sessions" section. Tapping it sets
  `prefillBean` and switches to the Roast tab; a `useEffect` applies the bean name to the Session Header
  (only when no roast is in progress, so a live session is never clobbered) and clears the prefill.
- The Roast Session Header has no Origin field today, so only the name is prefilled (left a
  `// TODO: Casey review` if you want an Origin field added).

### IDEA-009 — Settings: Units of Measure
- New file `src/hooks/useUnits.js`. **Deviation from the prompt sample:** RoastLogs stores temps in
  **Fahrenheit** (inputs are labelled °F, placeholder 205) and weights in grams — the sample assumed
  Celsius-stored values, which would be wrong here. The hook treats the stored temp unit as °F and
  converts only at display time. Stored values are never changed.
- `src/App.js`: Settings now has a **Units** section with Temperature (°F/°C) and Weight (g/oz)
  toggles, persisted to `roastlogs_temp_unit` / `roastlogs_weight_unit`. Applied `toDisplayTemp` /
  `toDisplayWeight` to read-only displays in the **History roast detail** (green/roasted weight, timeline
  temps) and the **live roast log** temps. Editable input fields were intentionally NOT converted.
  Left a `// TODO: Casey review — verify all temp/weight display locations covered`.

### IDEA-004 — Profile vs. Actual deviations
- `src/App.js` (`RoastDetailChart`): computes deviations = where the Heat/Fan **in effect** at a profile
  step's time differs from the profile target by **more than ±1**. Renders red `<ReferenceDot>` markers
  on the chart at each deviation, a small "⚠ Profile deviation" legend, and a **Profile Deviations** text
  section below the chart. Shows "✓ Followed profile exactly" (green) when a profile is attached with no
  deviations, and renders nothing when no profile is attached.
- Note: the pre-existing "Profile vs Actual" planned/actual grid is untouched; the new deviations section
  is additive and complementary.

### IDEA-007 — Settings: Export Data
- `src/App.js`: **Export Data** opens a choice panel → "Export Roast Log (CSV)" / "Export Full Backup
  (JSON)". Data is pulled from Supabase (`fetchRoastsFromSupabase` / `fetchBrewsFromSupabase`) and merged
  with localStorage, deduped by id. CSV columns match the spec order; JSON matches the spec structure
  (`exportDate`, `appVersion`, `roastSessions` with nested `adjustmentLog`/`tastingNotes`, `beans`,
  `roastProfiles`, `brewSessions`). Client-side `downloadFile` blob download; spinner while gathering;
  success/error toast. Filenames: `roastlogs-export-YYYY-MM-DD.csv`, `roastlogs-backup-YYYY-MM-DD.json`.

### IDEA-010 — Settings: About modal
- `src/App.js`: **About** opens a dark/amber modal showing ☕ RoastLogs, v1.0.0, the tagline, the feature
  list, and a close (×). No external links.

### IDEA-008 — Settings: Light Mode toggle
- New file `src/lightMode.css` (warm parchment palette, amber accents unchanged; hex values flagged
  `// TODO: Casey review`). Imported in `App.js`.
- `src/App.js`: `theme` state + a Light Mode toggle in Settings. On change, persists `roastlogs_theme`
  and sets `data-theme` on `<html>`. On mount, a `useEffect` applies the saved theme so it persists
  across refresh.

### FORGE — AI roast profile generator (major feature)
- New file `src/components/ForgeTab.jsx`: input form (Bean Name*, Origin*, Grower/Farm, Processing
  Method*, Target Roast Level*, Importer Notes), cycling loading messages (every 2s), structured output
  (phases table, heat/fan timeline, expected first crack, flavor-note chips, ⚠ SR540 warnings callout,
  general notes), and Save / Generate-Another buttons. Includes the exact `FORGE_SYSTEM_PROMPT` and the
  Claude API call from the spec, with the security-debt comment and all the specified error messages
  (AUTH_FAILED / RATE_LIMITED / parse error / network / missing key).
- `src/App.js`: imported `ForgeTab`; added it as the 5th bottom-nav tab (new `ForgeIcon` flame). Nav
  order is now **Roast · History · Brew · Beans · Forge**, and **Settings moved to a gear icon in the
  header** (top-right) per the locked decision. `handleSaveForgeProfile` converts the AI profile into the
  app's profile shape and saves it.
- **Save target deviation:** the spec said insert into a Supabase `roast_profiles` table, but this app
  does not use that table — profiles live in localStorage (`global_profiles`) and the `profiles` state.
  I saved Forge profiles there instead, so they appear in the Profile Builder (matching the success
  toast). Flagged with a `// TODO: Casey review` in `handleSaveForgeProfile`.
- **AI ✦ badge:** added an amber "AI ✦" badge wherever profiles are listed (RoastModeDialog, Bean Detail
  Saved Profiles, Settings Manage Profiles) when `isAiGenerated` is true.

---

## ⏭ Skipped — Already Implemented (verified in code, not trusting the stale bugs file)

- **BUG-002** (edit-mode timestamps as raw seconds): Already fixed. In `App.js` the edit-mode timeline
  inputs use `value={formatTime(entry.t)}` and parse MM:SS back to seconds on change. Displays as MM:SS.
- **BUG-004** (Fruity sub-categories single-select): Already fixed. `expandedFruitType` is an array
  (`useState([])`) with proper multi-expand toggle/`.includes()` logic.
- **BUG-005** (Profile Builder steps append to top): Already fixed. `addStep` appends
  (`steps: [...prev.steps, newStep]`) and `handleSave` sorts by `totalSeconds`.
- **BUG-006** (Heat/Fan accept values > 9): Already handled by design. The Profile Builder uses a
  `DrumRollPicker` constrained to values `[1..9]` for Heat and Fan, so out-of-range values are impossible
  — no free-text number input to clamp.
- **IDEA-005** (Brew custom ratio free text): Already implemented. A text input appears when
  `brewRatio === "Custom"` (state `customRatio`), and `handleSaveBrew` saves `customRatio` into `ratio`.

---

## 🚧 Incomplete

- None of the work-queue items were left incomplete. See "Decisions Needed" for the two intentional
  deviations (units canonical = °F, Forge save target = localStorage) that I want you to confirm.

---

## ❓ Decisions Needed from Casey

1. **Units canonical unit.** The app stores temps in °F. `useUnits` therefore treats °F as canonical and
   converts to °C only for display. If any stored temps are actually Celsius, the conversion direction
   would need to flip. Please confirm temps are stored in °F everywhere. (TODO left in `useUnits.js`.)
2. **Forge save target.** Profiles are saved to localStorage `global_profiles` (where the rest of the app
   reads profiles), NOT a Supabase `roast_profiles` table — that table isn't wired into this codebase.
   If you want AI profiles synced to Supabase, we need to add a `roast_profiles` sync path (the existing
   `syncService.js` only handles `roasts` and `tasting_notes`). (TODO left in `handleSaveForgeProfile`.)
3. **Origin prefill.** "Log a Session" prefills only the bean name because the Roast Session Header has no
   Origin field. Want me to add an Origin field to the Session Header? (TODO left in the prefill effect.)
4. **Light mode palette.** The light-mode hex values in `src/lightMode.css` are first-pass; tweak to taste
   before launch (TODO left in the file).
5. **Nested `roastlogs/` clone.** Recommend deleting the untracked nested `roastlogs/` directory (separate,
   older clone) once you confirm nothing depends on it.

---

## 🧪 How to Test Each Change (localhost:3000)

Run `npm start`, then:

**BUG-003 — Brew photo validation**
1. Brew tab → "Tap to add photo" → pick a normal photo → thumbnail appears.
2. Pick a non-image file (e.g. a PDF) → red error "Unsupported file type…", no thumbnail.
3. Pick an image > 5MB → red error "Image is too large (max 5MB)…", no thumbnail.
4. Tap the X (or REMOVE PHOTO) → photo + error clear.

**IDEA-006 — Log a Session**
1. Beans tab → tap a bean → in "Roast Sessions" find the amber **LOG A SESSION** button.
2. Tap it → app jumps to the Roast tab and the Session Header **Bean Name** is pre-filled.
3. (Edge) If a roast timer is running, prefill is skipped so the live session isn't clobbered.

**IDEA-009 — Units**
1. Gear icon (top-right) → Settings → Units → set Temperature to **°C**.
2. History tab → open a roast with temps → timeline temps + weights reflect the chosen units
   (weights show oz if you flipped weight). Switch back to °F/g → reverts. Editable fields stay raw.

**IDEA-004 — Profile Deviations**
1. History → open a roast that had a **profile attached** and manual adjustments → chart shows red dots
   at deviation points; below the chart a **Profile Deviations** list with `MM:SS Heat/Fan: logged X,
   profile called for Y (difference: ±Z)`.
2. Open a roast that followed its profile within ±1 → "✓ Followed profile exactly".
3. Open a roast with **no profile** → no deviations section at all.

**IDEA-007 — Export Data**
1. Settings → **Export Data** → two options appear.
2. "Export Roast Log (CSV)" → `roastlogs-export-YYYY-MM-DD.csv` downloads; opens in Excel/Numbers with
   the spec columns.
3. "Export Full Backup (JSON)" → `roastlogs-backup-YYYY-MM-DD.json` downloads; valid JSON with the spec
   structure. Spinner shows while gathering; success toast after.

**IDEA-010 — About**
1. Settings → **About** → modal shows name, v1.0.0, tagline, feature list. × closes it.

**IDEA-008 — Light Mode**
1. Settings → **Light Mode** ON → background shifts to warm cream, amber accents unchanged, text readable.
2. Toggle OFF → dark returns. Refresh the page → the chosen theme persists.

**FORGE**
1. Bottom nav now ends with **Forge** (flame). Settings is the **gear icon** top-right.
2. Forge → fill required fields → **Generate My Profile** → cycling loading messages → structured profile
   (phases, heat/fan timeline, flavor chips, warnings, notes).
3. **Save This Profile** → success toast → go to a bean's Saved Profiles / Settings → Manage Profiles →
   the profile shows with an **AI ✦** badge.
4. Missing-key test: temporarily blank `REACT_APP_CLAUDE_API_KEY` in `.env` → "Forge API key not
   configured…" message (do not commit the .env change).

---

## 🔀 Git Instructions for Casey

- **Review:** `git checkout session/20260529-bugs-and-features` then `npm start`
- **Merge to develop:** `git checkout develop && git merge session/20260529-bugs-and-features`
- **Discard:** `git branch -D session/20260529-bugs-and-features`
- (Optional) push the recovery tag: `git push origin snapshot-before-session-20260529`

I did **not** commit anything (per your instructions) — all changes are in the working tree on the
session branch. Files touched: `src/App.js` (modified); new `src/components/ForgeTab.jsx`,
`src/hooks/useUnits.js`, `src/lightMode.css`. The `build/` folder was regenerated during a compile check
and then restored to its committed state so it won't clutter your diff.

---

## 🔒 Security Notes

- **No new credential exposure.** No keys hardcoded or logged. (`supabaseClient.js` logs only `!!supabase`
  — a boolean — unchanged.)
- **No `dangerouslySetInnerHTML`** introduced (none in the codebase).
- **Photos stay local.** Brew photos remain base64 in IndexedDB only; nothing image-related is written to
  Supabase. The export JSON is a local download and contains only the photo *key* string, not base64.
- **Pre-existing security debt (unchanged, flagged):** the Forge Claude API key is used client-side via
  `REACT_APP_CLAUDE_API_KEY` (`x-api-key` in a browser `fetch`). This is the known debt called out in the
  master prompt; commented `// SECURITY DEBT: API key is client-side. Move to a serverless proxy before
  public launch.` Anyone using the app can read the key from network traffic — move it behind a proxy
  before any public launch.
- RLS is still disabled on Supabase (pre-existing, not changed).
