# RoastLogs v2.0.0 — Design Direction ("Instrument Panel")

**Status:** Concept stage. Not started. Dark mode has a working reference mockup
(Roast tab only); light mode is a brief, not yet designed. Nothing in this
folder has touched the live app — v1.2.1's light/dark token system
(`src/theme.css`) is unaffected and still what's shipped.

## Origin

After finishing the v1.2.1 light-mode token overhaul (semantic CSS-variable
tokens replacing the old `lightMode.css` override hack), we installed the
`design-taste-frontend` skill (github.com/Leonxlnx/taste-skill, MIT,
64.7k stars) and used it to explore a full visual overhaul of the Roast tab
with no constraints — "let it redesign anything." The result was a
distinctive "instrument panel" direction that Casey liked enough to want
carried across the whole app as v2.0.0.

The skill's own docs flag it as built for landing pages / portfolios /
marketing redesigns, explicitly **not** for dense product UI or dashboards —
which the Roast tab technically is (a live cockpit someone reads mid-roast,
hands busy). The direction below leans on the parts of the skill that
transfer regardless (typography discipline, color calibration, anti-generic-
AI-slop rules, motion restraint) while keeping the actual instrument values
large and legible, since that constraint doesn't go away just because the
skin changed.

**Reference mockup:** `roast-tab-dark-concept.html` in this folder — a
self-contained HTML file (fonts embedded as base64, no external requests).
Open it directly in any browser, or re-publish it via Claude's Artifact tool
in a future session to view/share it with a link.

## Design language (applies to both themes — this is the part that doesn't change)

- **Typography:** IBM Plex family, three roles from one family (not three
  unrelated fonts): **IBM Plex Sans Condensed** (headlines, instrument
  labels), **IBM Plex Sans** (body/UI text), **IBM Plex Mono** (every
  number — timer, temps, dial values, weights, dates). Avoids the Inter /
  Space Grotesk "safe default" the skill explicitly flags as an AI tell.
- **Visual identity:** the app treated as a precision physical instrument
  (chronograph, dial gauges, a phase-milestone rail) rather than a generic
  mobile form with rounded input boxes. Numbers are the priority —
  `font-variant-numeric: tabular-nums` everywhere digits line up.
- **Density:** cockpit-leaning but not packed. Live data gets room to
  breathe (real padding inside dial tiles) rather than dense-table spacing.
- **Motion:** one orchestrated entrance per screen (staggered fade + rise on
  load), plus motivated ambient state indicators only (a live pulse dot for
  an active roast — the same idea as the existing green sync dot, just
  extended). No scroll gimmicks, no decorative animation for its own sake.
  Everything respects `prefers-reduced-motion`.
- **Corners:** a deliberate two-tier system, not a mix. Main panels are
  sharp-to-near-sharp (2-4px). Interactive pills and buttons get a small
  consistent radius (pills fully rounded, buttons ~4-6px). Document this
  rule wherever it's implemented so it doesn't drift.
- **Reusable component patterns** (built for Roast, meant to extend):
  - **Tactile dial** — label + big mono numeral + either a tick-row gauge
    (for bounded 1-9 values like Fan/Heat) or a trend caret (for unbounded
    values like Temp).
  - **Phase-milestone rail** — horizontal line, filled to current progress,
    stop nodes with real timestamps. Encodes actual state, not decoration.
  - **Inline sparkline** — polyline + low-opacity area fill + faint grid +
    an emphasized endpoint dot. Same treatment for any small chart in the
    app, not just the Roast hero.
  - **Chronograph numeral** — the huge mono elapsed-time readout, reused
    anywhere a live duration matters.

## Dark mode palette — "Black and Tan" (designed, in the mockup)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#15120F` | page background — warm near-black, never pure `#000` |
| `--surface` | `#1F1A16` | panel background |
| `--surface-2` | `#29221C` | elevated / active panel |
| `--ink` | `#F3ECE3` | primary text — warm off-white |
| `--ink-muted` | `#A99C8E` | secondary/label text |
| `--accent` | `#D97D3D` | burnt copper — the one accent, used everywhere |
| `--accent-ink` | `#17110B` | text on accent fills |
| `--line` | `#352C24` | hairline borders |
| `--good` | `#7BB489` | semantic success (separate hue from accent) |
| `--warn` | `#D9B24C` | semantic caution (separate hue from accent) |

Deliberately **not** the beige/cream/brass/espresso family — `design-taste-
frontend` calls that out by name as the overused default for coffee and
artisan-craft briefs, and it's also literally what the current v1.2.1 light
theme already uses. Reusing it for v2's dark mode would blur the two
directions together instead of giving this a real identity of its own.

## Light mode — brief for the next session (not yet designed)

Casey's direction: light mode should follow the **same design language**
above (Plex type system, the four component patterns, motion restraint, the
two-tier corner system) but with its **own deliberately chosen palette** —
not a naive inversion of the dark tokens, and not a reuse of v1.2.1's warm
cream/kraft-paper identity. Same product, different lighting condition, not
two unrelated skins wearing the same logo.

**Starting-point palette** (already used as the mockup's light-mode
fallback tokens, since it was built theme-aware from day one — but this has
**not** been through its own dedicated `design-taste-frontend` pass focused
on light specifically, so treat every value below as a draft, not a
decision):

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#F1F0EE` | cool bone, not warm cream |
| `--surface` | `#FFFFFF` | panel background |
| `--surface-2` | `#E7E4DF` | elevated / active panel |
| `--ink` | `#1A1613` | primary text |
| `--ink-muted` | `#746A5F` | secondary/label text |
| `--accent` | `#C2601F` | same copper family, deepened for AA on a light ground |
| `--accent-ink` | `#FFFDF9` | text on accent fills |
| `--line` | `#DCD8D1` | hairline borders |
| `--good` | `#3F7A52` | semantic success |
| `--warn` | `#9C7A1E` | semantic caution |

### Open questions for whoever (Claude or Casey) picks this up

1. **Run the skill fresh, don't just reuse the table above as final.** Feed
   it this brief plus "match the dark concept's component patterns exactly;
   propose an independently considered light palette" — the goal is a real
   light-mode design read, not an inversion exercise.
2. This app gets used in bright kitchens / possibly outdoor light while
   actually roasting. Does "cool bone" hold up under glare, or does light
   mode want something with more contrast headroom than a typical marketing
   page would call for? Worth testing on an actual phone screen outdoors,
   not just checking contrast math.
3. Do the semantic `good`/`warn` hues need to be different families in light
   vs. dark, or does the same relative hue read fine on both grounds? (The
   table above already has both values filled in — this is really "sanity
   check them," not "solve from scratch.")

## Tab-by-tab extension plan

- **Roast** — done. Reference: `roast-tab-dark-concept.html`.
- **Brew (tasting wizard)** — descriptor chips become the same pill
  treatment as the dial ticks/phase rail; the `BagLabelCard` summary becomes
  an instrument-style tasting readout instead of a dashed "bag label" (that
  motif was part of v1's identity, not v2's); star ratings stay but restyle
  to the new accent.
- **History** — the roast curve chart already got real CSS-variable tokens
  in v1.2.1 (see `src/components/charts/RoastCurveChart.jsx`); v2 extends
  that same sparkline treatment (area fill, faint grid, emphasized
  endpoint) more consistently, and list rows adopt mono numerals for
  durations/dates/temps the way the Roast dials do.
- **Beans** — list/detail views carry the type system over; consider
  whether monogram avatars or roast/tasting counts want any of the tick-row
  language, or whether that's overreach for a list screen. Needs an actual
  design pass, not just a mechanical carry-over.
- **Settings** — preference toggles (units, light mode switch) redesigned
  as instrument-style segmented controls matching the dial aesthetic.

None of the above except Roast has been designed yet — this is a plan for
*what to design next*, not a spec to implement blind.

## How to resume this project

1. Open `roast-tab-dark-concept.html` in a browser (or re-publish it via
   Claude's Artifact tool) to see the reference direction again.
2. Read this whole doc for the design language and both token tables.
3. Run `design-taste-frontend` fresh for the light-mode direction, using the
   brief above — don't skip straight to implementation with the draft
   palette.
4. Once both directions are approved (dark confirmed already, light net
   new), scope the actual implementation as its own project. Expect it to
   look like the v1.2.1 light-mode work in shape — new semantic tokens,
   then a systematic tab-by-tab conversion pass, then Playwright baseline
   updates — but larger, since this changes the *design*, not just makes
   an existing one theme-aware.
5. This is a real major-version visual change (every screen, both themes).
   Plan a dedicated session for it, not a quick add-on to something else.

## Reference

- Explored: 2026-07-17, same session as the v1.2.1 light-mode release.
- Skill: `design-taste-frontend` (github.com/Leonxlnx/taste-skill), installed
  at `.agents/skills/design-taste-frontend` (symlinked into
  `.claude/skills/`).
- Typeface: IBM Plex (Sans Condensed / Sans / Mono), self-hosted as base64
  `@font-face` data URIs directly in the mockup — Artifacts block font CDNs,
  so this was fetched once during authoring, not loaded at runtime.
