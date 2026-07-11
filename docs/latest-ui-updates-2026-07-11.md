# Latest UI Updates — 2026-07-11

**Status: design reference only. Nothing described here has been implemented in
`src/App.js` yet.** This file exists so a future Claude Code session can pick
up implementation without re-deriving the research and decisions from this
one. Point Claude Code at this file directly (e.g. "read
`docs/latest-ui-updates-2026-07-11.md` and implement the History section").

## How this came about

Casey asked what RoastLogs' UI would look like if redesigned using
[`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill), an
"anti-AI-slop" frontend design framework (three tunable dials, hard
typography/color/layout rules, and a redesign-preserve audit protocol for
existing projects). A session reviewed the skill's actual rules, audited
RoastLogs' current UI against them, and produced a static HTML mockup
(published as a private Claude artifact, phone-frame before/after comparisons
with numbered rule annotations) covering five screens: Active Roast, Profile
Builder, History, Brew, and Beans. Casey liked the direction but didn't have
time to implement it that session — this doc captures everything needed to
finish the job later.

The mockup itself was **exploratory only**: a standalone HTML file, never
wired into the app, no repo files touched. This doc is the durable record;
the mockup HTML was scratch and does not need to be tracked down.

## Global takeaway

Most of taste-skill targets marketing sites (heroes, bento grids, GSAP scroll
hijacks) and doesn't apply to a bottom-nav phone PWA. RoastLogs already
passes several of its hard rules out of the box:
- Single accent color (amber-500) on a neutral zinc base — exactly what the
  skill prescribes (it explicitly bans the "AI purple/blue glow" default).
- Dark-mode-first, consistent two-tier corner-radius system, `tabular-nums`
  on data.

What actually moves the needle: typography hierarchy/contrast, density tuned
toward the skill's "cockpit / packed-data" end (this is a tool glanced at
one-handed mid-task, not read top-to-bottom), and motivated micro-motion
(tactile press feedback only, never decoration).

**Dial settings used throughout:** `DESIGN_VARIANCE ≈ 4/10`,
`MOTION_INTENSITY ≈ 3/10`, `VISUAL_DENSITY ≈ 6-7/10` (cockpit end). None of
taste-skill's presets (minimalist/Linear, premium-consumer, playful/Awwwards,
trust-first/public-sector) cleanly fit a utility roast-logging cockpit, so
these were reasoned from first principles rather than picked off the table.

**Redesign-preserve order followed for every screen:** typography → spacing
and density → color recalibration → motion layer. Nothing about the app's
information architecture changes.

## Stays locked, across every screen (do not change)

- Control order **Fan → Heat → Temp**, everywhere (inputs, timelines,
  summaries, tooltips) — this is a hard CLAUDE.md convention.
- `zinc-950` background / `amber-500` accent, single accent color only.
- Dark-only. No light mode anywhere, including fixing the one screen below
  that currently breaks this rule.
- Phase labels exactly as-is: `START` / `YELLOWING` / `FIRST CRACK` /
  `COOLING START`.
- Existing two-tier radius system (`rounded-3xl` cards / `rounded-2xl`
  tiles/inputs).
- Heat and Fan stay discrete 1-9 dials; chart lines for them stay
  `type="stepAfter"`, never smoothed (existing CLAUDE.md rule, unaffected by
  any of this).

## Deliberately skipped everywhere (taste-skill rules that don't apply here)

- Hero/marketing patterns — no landing page anywhere in this app, it's all
  tool screens.
- Bento grids — nothing to arrange as a gallery of cards.
- GSAP scroll effects — a logging tool shouldn't animate on scroll.
- Eyebrow labels as decoration — fine as plain section labels, never as a
  "V0.6 / BETA" style AI tell.

---

## 1. Active Roast tab (`src/App.js`, live-roast render block ~1852-2254)

The live cockpit: timer, Fan/Heat/Temp dials, phase-log buttons, running
timeline. Highest-traffic, most time-pressured screen (used one-handed mid-roast).

**Key existing anchors:**
- Live Timer card: ~1959-1975 (`formatTime(elapsedSeconds)`, `font-mono
  text-6xl text-amber-400`)
- Phase Milestones card (Start + Yellowing/First Crack/Cooling Start
  buttons): ~1977-2044
- Unified Roast Timeline (log list): ~2100-2163
- Floating "+" adjustment-log button: ~2165-2180 (already uses
  `active:scale-95` — correct tactile feedback, keep as-is)
- Adjustment Log popup (Fan/Heat/Temp number-pad entry): ~2182-2254

**Changes to make:**
1. **Hero cockpit** — combine the timer with the *last logged* Fan/Heat/Temp
   reading in one card, instead of that reading being buried behind the
   adjustment popup. Push the timer's type size/weight up (mockup used 68px/800
   vs. today's `text-6xl`/600).
2. **One action row** — collapse Start/Pause + the three milestone buttons
   from a 2×2 grid + separate full-width button into a single row of pills.
   Logged milestones render amber-filled (state encoded in form, not just
   text) instead of an outline.
3. **Fan/Heat/Temp tiles always visible** — a 3-tile row (Fan → Heat → Temp
   order preserved) showing current values at a glance, not just inside the
   adjustment popup. Temp tile gets the amber tint (it's the value chased
   hardest around first crack).
4. **Compressed timeline** — tighten `Roast Timeline` list rows from padded
   divided items (~py-3 with full dividers) to a tight color-barred list
   (amber bar = phase entry, gray bar = adjustment entry) so roughly 2x the
   entries fit in the same viewport height.
5. **FAB stays as-is** — extend its existing `active:scale-95` tactile
   press pattern to the new pill buttons and timeline rows for consistency,
   but don't redesign the FAB itself.

---

## 2. Profile Builder (`src/App.js:569-814`, plus usages at `2047-2057` and `3663-3724`)

**How it works today** (for context — read this before changing anything):
A "profile" is a named list of steps (`{time, totalSeconds, heat 1-9, fan
1-9}`, no temp field) the app auto-follows during a live roast. Opened from
the "Build Profile" card on the Roast tab (`~1932-1957`) or from a bean's
detail page ("+ NEW PROFILE", `~3663-3724`). Every value in every step
(minutes, seconds, fan, heat) currently opens its own full-screen
`DrumRollPicker` scroll wheel (`569-644`) — a 4-step profile means 16
separate wheel-picker taps. Steps auto-sort by `totalSeconds` on save
(`handleSave`, `686-700`) regardless of add order, with **no reordering, no
validation, and no edit-after-save** (only delete + set-default). Saved
profiles feed `RoastModeDialog` (`768-814`) → `startRoast` (`1347-1368`) →
an auto-advance effect (`1267-1312`) that logs each step's heat/fan by
elapsed time and renders the step chips seen in the Phase Milestones card.

**Key line ranges:**
- `DrumRollPicker` component: `569-644`
- `ProfileBuilder` component: `646-766`
  - state/helpers (formatMMSS/parseMMSS/addStep/updateStep): `647-684`
  - `handleSave`: `686-700`
  - modal shell + name input: `702-711`
  - step list rendering: `712-758`
  - add-step button: `757`
  - Cancel/Save buttons: `759-762`
- `RoastModeDialog`: `768-814`
- App state (`profileFollowing`/`profiles`/`isProfileBuilderOpen`):
  `894-911`, persistence at `1183`
- Auto-advance/logging effect: `1267-1312`
- `startRoast`: `1347-1368`

**Changes to make:**
1. **Inline steppers replace wheel pickers** — Fan and Heat stay discrete
   1-9 dials (no data-model change), but each becomes a compact –/+ stepper
   instead of opening a full-screen wheel. Time collapses to one tappable
   `MM:SS` chip instead of two separate wheels.
2. **Surface the auto-sort behavior** — add a small "steps sorted by time"
   caption near the step list so the existing silent sort-on-save behavior
   isn't a surprise.
3. **Add a profile preview** — a small fan/heat bar strip above the step
   list showing the shape of the profile before saving (currently zero
   feedback exists until you're mid-roast watching chips flash by).
4. **Aspirational, bigger lift, scope separately if pursued:** a real
   drag-to-reorder handle. The mockup showed one for illustration but it is
   **not implemented anywhere in the current app** — this needs its own
   scoping (real drag-and-drop wiring) rather than being bundled with the
   visual changes above.
5. Out of scope for this pass: adding an edit-existing-profile path. Noted
   as a real gap (today only create/delete/set-default exist) but wasn't
   part of what was mocked up — flag to Casey if worth adding later.

---

## 3. History tab (`src/App.js:2816-3252`, plus `src/components/charts/RoastCurveChart.jsx`)

**Key line ranges:**
- List view: `2816-2908` (segmented Roasts/Tastings control, search-by-bean-
  name input, empty state)
- Detail view: `2909-3252`
  - header stat grid (Green/Roasted Weight, Duration, Dev Time, Roast Level):
    `2951-3067`
  - `RoastCurveChart roast={selectedRoast}` embed: `3064`
  - "Profile vs Actual" planned/actual grid: `3069-3102`
  - Roast Timeline (chronological log, already uses `F: · H: · T:` per
    CLAUDE.md convention): `3104-3241`
  - Delete button → `handleDeleteRoast`: button at `3243-3251`, handler at
    `1503` (currently `window.confirm(...)`, a native unstyled browser
    dialog)
- Dead code: `RoastDetailChart` (~line `49`, ~70 lines) has **zero call
  sites** anywhere in `App.js` — superseded by `RoastCurveChart`. Safe to
  delete during this pass, or leave and ignore; not required either way.

**`RoastCurveChart.jsx` is already well-executed** (stat-tile row + synced
dual chart — temp/RoR line over phase bands, heat/fan `stepAfter` step chart,
dark tooltip, phase reference lines). **Do not redesign this component** —
it's the most "designed" part of the app already; only the list/detail
chrome around it needs work.

**Changes to make:**
1. **Roast-level color bar on each list row** — a real coffee-roast color
   spectrum (light tan → dark roast), used as a left accent bar per row.
   This is domain-grounded *semantic* color for roast level, separate from
   the app's single amber brand accent — it does not violate the "one
   accent" lock. Suggested stops: Light `#e8c99a`, City `#c98f52`, City+
   `#a56a3a`, Full City `#8a5230`, Dark/French `#6b4226` (tune for contrast
   against `zinc-900` panels).
2. **Replace the sparkline with a compact Fan/Heat/Temp summary line**
   (same order/format as the Roast Timeline's `F: · H: · T:`) — more
   information per row than a single-series temp sparkline, in less visual
   space.
3. **Styled delete confirmation** — reuse the app's own existing styled
   discard-modal pattern (already built for discarding an in-progress
   roast, see the Roast tab's `showDiscardModal`) instead of native
   `window.confirm()` at line `1503`. No new component needed.
4. **Distinct empty states** — "no roasts yet" should get its own copy plus
   a CTA back to the Roast tab, instead of sharing one generic message with
   "no results for this search."

---

## 4. Brew tab (`src/App.js:2286-2814`, `handleSaveBrew` at `1640-1695`)

A 5-step wizard (setup → acidity/body → flavor family → descriptors →
summary), no list of past brews in-tab (those live under History → Tastings
or a bean's detail page). Only two steps need visual work — **steps 1-3
(acidity/body ratings, flavor family, descriptors) are fine as-is**, reuse
the same rating-grid/tile pattern already there.

**Key line ranges:**
- Step 0, Setup: `2286-2459` (linked-roast `<select>` at `2296`, bean name,
  method/device, ratio + custom-ratio input, grind, water temp, photo picker)
- Step 4, Summary: `2708-2812` — **renders as a plain white card
  (`bg-white ... text-zinc-950`)**, the single light-background surface
  anywhere in this otherwise dark-only app. This is the one real
  taste-skill rule violation found in the whole codebase ("ONE theme lock
  for the whole page").
- `handleSaveBrew`: `1640-1695`

**Changes to make:**
1. **Group Setup into labeled sections** — "Session" (linked roast + bean
   name) and "Parameters" (method/grind as cockpit-style tiles, ratio as
   one-tap quick-select chips `1:15 / 1:16 / 1:17 / Custom` instead of
   always opening a dropdown, water temp as a labeled field). Photo picker
   keeps its dashed-border upload affordance, just restyled to match the
   rounded-tile system used elsewhere.
2. **Rebuild the Summary "bag label" card inside the dark/amber system** —
   same concept (name, method, rating, brew-again), replace the literal
   white card with a dark card using a dashed amber rule top/bottom to evoke
   a printed label without breaking dark-only. This is the highest-priority
   single fix in this whole document.
3. Notes field and Back/Save buttons: keep structure, just restyle to match
   the labeled-field pattern used across the rest of this pass.

---

## 5. Beans tab (`src/App.js:3438-3958`)

**Key line ranges:**
- List: `3440-3547` (beans are *derived* — unioned from `roasts`,
  `tastingNotes`, and manual `localStorage("beans")` entries, not a
  first-class store)
- Add Bean form: `3549-3641` (name, origin, farm/producer, purchase date,
  purchase weight — **no photo field**, unlike Brew)
- Bean detail: `3643-3814` (Saved Profiles + "+ NEW PROFILE" reusing
  `ProfileBuilder`, "LOG A SESSION" button at `3771-3781`, Roast Sessions
  and Tasting Notes lists)
- `roastDetail` sub-view: `3880-3941`; `tastingDetail` sub-view:
  `3947-3958+` — both are explicitly commented `// REPLICATED FROM HISTORY`
  in the source, i.e. duplicated markup rather than a shared component.

Confirmed (matches CLAUDE.md): beans, profiles, and photos are
`localStorage`-only, no Supabase sync — a durability risk worth keeping in
mind, not something this visual pass fixes.

**Changes to make:**
1. **Monogram avatar per bean row** — an amber-ringed circle with the
   bean's first initial. Beans genuinely have no photo field (unlike Brew's
   photo picker), so this is an honest fallback anchor, not a placeholder
   icon or a fake photo slot.
2. **Surface origin under the bean name** in the list (currently only
   visible after opening bean detail) — often the only thing distinguishing
   two beans with the same varietal name.
3. **Stat pills** — replace the plain "N roasts · N tastings" text line
   with small pills, easier to scan down a longer list.
4. **Not a visual change, but worth doing in the same pass if touching this
   code:** extract `roastDetail`/`tastingDetail` into a shared component
   with History's detail view instead of the current duplicated markup.

---

## Suggested implementation order

1. Brew summary card (single highest-value fix — removes the only
   dark-mode rule break in the app, small and self-contained).
2. Active Roast tab (highest-traffic screen).
3. History list rows + delete-confirm swap.
4. Beans list rows.
5. Profile Builder inline steppers (skip the drag-reorder handle unless
   Casey explicitly asks for real reordering — scope that separately).

## How to verify each screen once implemented

Per this repo's standing workflow (see root `CLAUDE.md`):
- Run `/ui-loop` after each screen's UI changes — visual baselines exist for
  login, roast tab, picker, and history chart; add a baseline for any new
  screen state touched here (e.g. Profile Builder, Brew summary).
- Don't commit until asked; Casey phone-tests on a real SR540 roast before
  shipping.
- Display-order changes must never require data migration — keep reading
  log entries by field name (`entry.fan` / `entry.heat` / `entry.temp`), not
  array position.
- Suggest `/code-review` on the diff before any deploy of these changes.
- None of this requires touching Supabase/RLS/auth — pure UI, no
  `security-auditor` pass needed unless a future change touches sync code.
