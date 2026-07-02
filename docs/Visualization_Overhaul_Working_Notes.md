# RoastLogs Visualization Overhaul Working Notes

Date: 2026-07-01

## Current Process State

- Goal: begin v1.1.0 data visualization overhaul for RoastLogs, focused first on mobile iPhone views.
- Source brief reviewed: `/Users/casey/Downloads/RoastLogs_Project_Summary_For_External_AI (1).md`.
- Primary target from the brief: a standalone Recharts-based `<RoastCurveChart />` component.
- App target: React 18 Create React App, Tailwind CSS, Recharts, Supabase auth/sync.
- Primary viewport for review: iPhone-sized layout around 390px wide.

## Locked Visualization Requirements

- Use Recharts for charts.
- Temperature is a smooth monotone line.
- Heat and fan are discrete SR540 dial settings and must render as `stepAfter` lines.
- Phase markers should be vertical reference lines.
- RoR should be derived from temp readings and smoothed with a simple moving average.
- DTR should be shown as a headline metric when first crack and cooling start exist.
- New visualization code should be modular, under component files rather than expanding the monolithic `src/App.js`.

## App Access Notes

- Local app URL: `http://localhost:3000/roastlogs`.
- Supabase configuration exists in `.env`.
- Login uses Supabase email/password auth through `signInWithPassword`.
- A second email account owned by Casey was created/signed in locally for app review.
- Codex browser check at 390 x 844 still lands on the sign-in screen, so the signed-in session is not currently available inside the controllable in-app browser.
- Whether that user sees real roast data depends on current Supabase RLS/table ownership policies and whether rows are associated with the new user.

## Next Best Steps

1. Verify authenticated mobile screens in an iPhone viewport.
2. Inspect current History roast detail chart on mobile.
3. Identify layout/data issues before implementation.
4. Build `src/components/charts/RoastCurveChart.jsx` against the props contract from the brief.
5. Add small plain-JS utilities for time formatting, RoR, DTR, and chart data normalization if useful.
6. Wire the component into the existing roast detail view after the standalone component is verified.

## Caution

- Existing working tree already contains user/app changes in `src/App.js`, build assets, manifests, package files, and docs.
- Do not revert unrelated changes.
- Avoid committing or staging unless Casey explicitly asks.

## Mobile Review Notes From 2026-07-01

- Verified signed-in app access in the Codex in-app browser at `http://localhost:3001/roastlogs`.
- Reviewed at an iPhone-sized viewport: 390 x 844.
- Roast tab renders cleanly on mobile: main session inputs, target level picker, build profile card, timer card, and bottom nav fit without horizontal scrolling.
- History list renders real roast cards with sparklines. Long bean names wrap and take vertical space, but the cards remain readable.
- Roast detail chart currently mixes temperature, heat, fan, and RoR on one Y-axis. This compresses heat/fan near the baseline and creates a confusing axis range from -150 to 450.
- Phase labels on the chart collide/cramp at the top on mobile, especially near First Crack and Cooling Start.
- DTR, total time, and weight loss metric cards are readable and worth preserving above or adjacent to the chart in the v1.1 component.
- Profile vs Actual is readable as a compact two-column mobile section below the chart.
- Roast Timeline is readable but dense; it should remain supporting detail below the primary visualization rather than carrying the main insight load.

## External Data Analyst Patch Reference

- Casey shared a ChatGPT Data Analyst patch bundle reference named `RoastLogs_History_Chart_v1.1_Patch_Bundle.zip`, with patch file `roastlogs_history_chart_v1.1.patch` and savepoint notes `RoastLogs_History_Chart_v1.1_SAVEPOINT.md`.
- The referenced links use `sandbox:/mnt/data/...`, which are not directly available in this local Codex workspace.
- Local search did not find the patch in `/Users/casey/Downloads` or `/Users/casey/Documents/roastlogs`.
- Before applying, transfer the patch file into the repo or Downloads folder, then review with `git apply --check` because the current worktree is already dirty and on branch `develop`.

## Patch Test Notes From 2026-07-02

- Local files were provided at `/Users/casey/Downloads/roastlogs_history_chart_v1.1.patch` and `/Users/casey/Downloads/RoastLogs_History_Chart_v1.1_SAVEPOINT.md`.
- The patch did not apply directly because it was generated from `/mnt/data/...` sandbox paths and a slightly different `src/App.js`.
- Manually transplanted the chart changes into the current `src/App.js`.
- Added `ReferenceArea` to the existing Recharts import.
- Replaced the embedded `RoastDetailChart` implementation with:
  - headline stat cards before the chart,
  - temperature on its own Y-axis,
  - heat/fan as stepped lines on a true `1-9` control axis,
  - RoR on a hidden `0-30` axis so it no longer compresses heat/fan,
  - phase bands and shorter phase labels.
- First browser test surfaced a null guard bug in RoR calculation; fixed by requiring the prior data point to exist before reading `temp`.
- `npm run build` passes after the transplant and after the null-guard fix.
- Verified the latest Columbia Hulia roast detail at `http://localhost:3001/roastlogs` in a `390 x 844` viewport.
- Current visual result: much clearer than the original chart, with visible heat/fan step changes and separate temperature scale. Remaining polish: the chart is visually dense on iPhone and may benefit from component extraction plus a dedicated RoR toggle in the next iteration.

## Reference Image Revision Notes

- Reviewed Casey's Data Analyst reference image from `/var/folders/0p/w5yqfddj1kn0qvh90m2tvls80000gn/T/codex-clipboard-24776a98-dc0b-4f04-a74c-ec2c5edcaf48.png`.
- Key desired qualities from that image:
  - clear "Roast curve" title block,
  - three compact headline cards,
  - smooth amber temperature curve,
  - red heat step line,
  - blue fan step line,
  - smooth violet RoR line,
  - phase reference lines,
  - custom legend without stray Recharts `child1`, `child3`, `child5`, `child7` artifacts.
- Updated the local chart toward that structure.
- Changed temp/RoR data preparation so temp and RoR are drawn from actual temperature readings rather than carrying forward temp every second.
- Ignored the initial low-temp-to-first-reading jump for RoR so the RoR curve is not dominated by startup sensor warmup.
- Clamped negative/cooling RoR to zero for visual stability.
- Verified Columbia Hulia chart again on `localhost:3001` at `390 x 844`.

## Mobile Axis Cleanup Notes

- Casey flagged that the X-axis should visibly start at `00:00`, the time axis should be labeled, and the Y-axis label should not be cut off on iPhone.
- Updated the roast curve X-axis to use a numeric time scale with fixed ticks at start, quarter points, and the final drop time.
- Moved "Bean temp (°F)", "Dial", and "Time" labels outside the Recharts plot area so mobile clipping does not cut off rotated axis labels.
- Left bean temperature on the left Y-axis and kept heat/fan on the right dial scale.
- The RoR line starts only after enough reliable temperature readings exist; the initial low-temp sensor warmup jump is still excluded.
- Heat/fan control lines now update from start/control entries instead of temperature-reading rows, which removes the short odd control blip around the 7-minute mark.
- When Maillard End and First Crack are less than 30 seconds apart, the chart keeps both vertical guide lines but collapses the label to `ME/FC` so iPhone views do not show overlapping phase text.
- Added per-second interpolation for bean temperature and smoothed RoR so hover/tooltips can show calculated Temp and RoR values for the full roast timeline, including between logged readings.
- Made the left Y-axis visibly own the temperature scale on mobile with explicit `100/200/300/400°F` ticks, and hid the right dial tick labels so the chart reads primarily as a temperature curve with heat/fan controls overlaid.

## Executive Polish Pass

- Replaced linear per-second interpolation with bounded cubic interpolation for temperature and RoR so the curves no longer visibly kink at ingest timestamps.
- Kept heat and fan as stepped lines because those represent actual dial changes.
- Added rounded stroke caps and joins to the orange temperature and purple RoR lines.
- Added `docs/Roast_Curve_Executive_Mockups.html` with three visual direction mockups:
  - refined overlay,
  - split executive read,
  - phase narrative.
- Copied the same static mockup sheet to `public/roast-curve-executive-mockups.html` so it can be viewed through `localhost:3001` without direct local-file navigation.

## Split Roast Story Direction

- Casey preferred combining the phase narrative from mockup 3 with the split analytical structure from mockup 2.
- Updated the live History roast detail chart into two coordinated visuals:
  - a development curve with smoothed Temp and RoR over phase bands,
  - a control map with stepped Heat and Fan over the same phase bands.
- Added summary tiles for Avg RoR, Avg temp, Drop temp, and DTR above the charts.
- Added phase tiles with phase time ranges and short interpretation labels.
- Enlarged the tooltip so Temp/RoR or Heat/Fan values are easier to read across the full roast.
- Updated `docs/Roast_Curve_Executive_Mockups.html` with a new recommended split-story mockup and copied it to the public static mockup path.
- Shortened the final phase marker from `Cool` to `Drop` to avoid clipping on iPhone and make the roast endpoint clearer.
