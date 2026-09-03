# Plan — History chart mirror + three roast-timeline fixes

Branch: `claude/roastlogs-v340-followup-gggbe0` (PR #13, which becomes a real
change rather than a docs pin).

Raised by Case after two live roasts on 2026-09-02.

---

## Blast radius, up front

- **No data migration, and nothing rewrites saved roasts.** Every fix either
  changes what is COMPUTED at save time going forward, or what is DERIVED at
  render time. Existing roasts render the same or better.
- **One behaviour change worth naming:** dev time stops being its own ticking
  clock and becomes arithmetic on two timestamps. Consequence: if a roast is
  paused mid-development, dev time freezes with the roast clock instead of
  continuing to count. That is consistent with every other number in the app,
  and it is what makes the Roast tab and History agree.
- Touches `src/App.js` (timers, timeline rows, profile auto-log) and
  `src/components/charts/RoastCurveChart.jsx`. Adds one new shared module.
- Visual baselines WILL change (History detail, roast tab). Budget a
  `npx playwright test --update-snapshots` run on Case's machine at the end.

---

## Fix 1 — Dev timer disagrees between Roast tab and History

**Symptom (Case, live roast).** Roast tab read 38s, maybe pushing 39. History
showed 40s.

**Root cause: three sources of truth, two of them wrong.**

1. Live: `devSeconds` is a **free-running `setInterval`** started when FIRST
   CRACK is logged (`App.js`, the `isDevTimerRunning` effect). It ticks on its
   own 1000ms clock, independent of the roast clock, so it drifts — browser
   timer coalescing, throttling, and the ticks that land between COOLING START
   and the state actually settling.
2. Saved: `handleStop` stores that drifted counter as `devSeconds`.
3. Edit view: already computes it CORRECTLY as
   `coolingStart.t - firstCrack.t`.

So the app already contains the right answer, in the one place Case rarely
looks.

**Fix.** Delete the interval and the `devSeconds` / `isDevTimerRunning` state.
Derive it everywhere from the two logged timestamps, which are exact
`elapsedSeconds` values captured at the instant each button was pressed:

- live, mid-roast: `elapsedSeconds - firstCrackTime`
- saved: `coolingStartTime - firstCrackTime`
- no cooling start logged: fall back to `elapsedSeconds - firstCrackTime`

This is exactly what Case asked for — "based on the exact time I hit the mark
cooling start button" — and it removes a whole class of drift plus a piece of
state. **Decided 2026-09-03: History recomputes at render.** When a saved roast's log
carries BOTH `FIRST CRACK` and `COOLING START`, History computes
`coolingStart.t - firstCrack.t` and shows that; when it does not, it falls back
to the stored `devSeconds`. So every past roast with a complete log immediately
shows the accurate number, the stored value is never rewritten, and incomplete
logs still render something.

Note the two decisions pull in the same direction: never hide what is stored
(the duplicate row stays visible), but do recompute a derived number that was
computed wrong.

---

## Fix 2 — Duplicate 00:00 row in the Roast Timeline

**Symptom.** Two rows at `00:00` with identical Fan/Heat: one carrying
`T: 259°F` and the START tag, one carrying `T: —`.

**Root cause.** The profile auto-log dedupe guard only looks for adjustments:

```js
const alreadyLogged = roastLog.some(
  entry => entry.t === elapsedSeconds && entry.type === 'adjustment'
);
```

The START row is `type: 'start_settings'`, not `'adjustment'`, so a profile
step at `00:00` never sees it and writes a second row with the same dials.

**Fix.** Widen the guard to any entry at that second that already carries dial
values — `start_settings` OR `adjustment`. One-line change, prevents the
duplicate at the source.

**Decided 2026-09-03: forward-only.** Roasts already saved (including the two
from 2026-09-02) keep their duplicate row. Nothing is hidden at render, so what
History shows is exactly what is stored. The guard simply stops new ones.

---

## Fix 3 — No temperature on markers, moments, or profile rows

**Symptom.** In the Roast Timeline, `T:` reads `—` on every profile-driven row,
and phase rows (TURNAROUND, MAILLARD, YELLOWING, CARAMELIZATION...) show no
temperature at all. Case wants temp AND time on all of them.

**Root cause, two parts.**

1. Profile auto-logged adjustments are written with `temp: ""` — nothing is
   known at log time.
2. Phase rows never render a temp: both timelines branch on
   `entry.type === 'phase'` and draw label + time only.

**Fix.** Resolve the temperature from the roast curve at render time. The curve
is 1Hz and every entry sits on a whole second, so the lookup is exact, not
interpolated. Applies to both timelines (live Roast tab and History detail),
for phase rows and for adjustments with an empty temp.

Why derive rather than stamp at log time: deriving fixes **every roast already
saved with a curve**, including last night's two, with one code path. Stamping
would only help roasts recorded from here on.

Probe-less roasts carry no curve, so those rows keep showing `—` — correct, the
temperature genuinely was not measured.

---

## Fix 4 — History chart mirrors the live instrument

`src/components/charts/RoastCurveChart.jsx` still runs the pre-ladder model.

**What is wrong today:**

- Three hardcoded hexes (`#f59e0b`, `#22c55e`, `#a78bfa`) — theme-blind, they
  ignore the light/dark toggle entirely, and they match nothing in the live
  palette. The same roast is amber-on-one-screen, warm-grey-on-the-other.
- Still the three-band `YELLOWING` / `FIRST CRACK` / `COOLING START` model. No
  Maillard-at-305F, no Caramelization, and it still draws a cooling band the
  live chart no longer has.
- In-plot phase labels — the pattern removed from the live chart because they
  collide with the y-axis ticks.

**Order of work — the extraction comes first, deliberately.**

1. **Extract the shared vocabulary** into `src/lib/roastPhases.js`:
   `PHASE_TAGS`, `PHASE_NAMES`, `PHASE_VAR`, `MOMENT_LABELS`, and the boundary
   resolution including the Maillard-falls-back-to-Yellowing rule. Both charts
   import it. Doing the colour swap first and the extraction later is how the
   two screens drift apart again.
2. Replace the three hexes with the phase tokens. Both themes come free.
3. Adopt the four-phase model + the Yellowing fallback; drop the cooling band.
4. Add the phase ribbon above the plot.
5. Add moment dots (`ReferenceDot` is already imported there).
6. Delete the in-plot phase labels; the ribbon replaces them.
7. Tooltip names the phase, and the moment when scanning near a dot.

**History-specific traps:**

- It is always a full-roast view, so it is the **worst** case for ribbon fit,
  not the average. Re-measure; do not assume the live chart's numbers carry.
- The Yellowing fallback is the **common** path here — every roast saved before
  2026-08-31 has no `MAILLARD` entry. Test it first, not last.
- Some saved roasts predate RoastLink and carry no `curve`. Moment dots must
  no-op cleanly while bands still render from log entries alone.
- `roast.curve` exists on newer roasts, so backfilling a 305F crossing is
  tempting. Case chose the fallback over rewriting saved data. Do not let that
  decision erode by accident.

---

## Verification

**Intent**
- Dev time identical in Roast tab and History, equal to
  `coolingStart − firstCrack`, for a roast driven end to end.
- Exactly one `00:00` row when a profile has a step at zero.
- Every timeline row shows a time; every row on a roast WITH a curve shows a
  temperature.
- History chart and live chart show the same phases, the same names and the
  same colours for the same roast, in both themes.

**Non-breakage**
- Production build compiles clean.
- A roast saved BEFORE today still opens in History, still renders its bands
  (via the Yellowing fallback), and shows no dots rather than crashing.
- A probe-less manual roast still renders the rail and the timeline.
- Playwright: full suite, with baselines regenerated on Case's machine.
