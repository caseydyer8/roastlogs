# Open actions — read at session start

> Case's standing instruction, recorded 2026-08-31. Surfaced automatically by
> the `SessionStart` hook in `.claude/settings.json`. **Delete or rewrite this
> file once the sequence below is done** — a stale open-action file is worse
> than none.

## Case's requested opening sequence

He asked, in his own words, to be told at the start of the next session:

1. **"We are ready to test on PR #13"** — say this first, before anything else.
2. Then **run the security agent** (`security-auditor`).
3. Then **merge, deploy, publish** (`/release` handles the three-place version
   bump; the deploy must run on Case's machine, never from a cloud container —
   the Supabase keys live only in his gitignored `.env`, and a build without
   them publishes a keyless bundle that locks both accounts out of the live
   site).

## One thing to raise with him before step 1

**PR #13 as it stands is docs-only** — a single markdown file, the v3.5.0
session pin plus the History-chart plan. There is nothing in it to functionally
test, and a security pass over a docs diff will find nothing, because it touches
no auth, sync, RLS or Supabase code.

So confirm which he meant:

- **(a)** Merge PR #13 as-is now (it is green and needs no ceremony), and apply
  the test -> security -> merge -> deploy sequence to the *next* piece of real
  work; or
- **(b)** Build the History chart work onto that same branch first, so PR #13
  becomes a real change worth testing, securing and shipping.

Ask; do not guess. Under either reading the security pass is worth running as a
**periodic audit** rather than as a gate on this diff — that is a legitimate use
of the agent, and Case asked for it, so run it either way. Just be honest about
what it did and did not cover.

## The actual next build, whichever way he answers

`docs/roastlink-live-data-plan.md` -> **"NEXT — mirror the live chart in
History"**. Short version: `RoastCurveChart.jsx` still runs the pre-ladder
three-band model and hardcodes `#f59e0b` / `#22c55e` / `#a78bfa`, which are
theme-blind and match nothing in the live palette, so the same roast shows
different colours depending on which screen you open it from.

**Lead by extracting the shared vocabulary** (`PHASE_TAGS`, `PHASE_NAMES`,
`PHASE_VAR`, `MOMENT_LABELS`, and the Maillard-falls-back-to-Yellowing boundary
rule) out of `LiveRoastChart.jsx` into one module both charts import — before
the visible colour swap. Duplicating those is how the two screens drifted apart
in the first place.

Also still unbuilt: the **equipment field** (SR540 bare / OEM extension tube /
V5T Razzo).

## Where the build stands

v3.5.0 shipped and verified live on 2026-08-31: bundle `main.f60e2005.js` ->
`main.929346fc.js`, `3.5.0` in the shipped JS, `3.4.0` gone, gh-pages
`e0ae528`. Playwright suite **38/38 green** after baselines were regenerated on
Case's machine at `17bb14a`. PR #12 merged. Nothing half-finished.
