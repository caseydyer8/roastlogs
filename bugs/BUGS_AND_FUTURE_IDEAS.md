# RoastLogs — Bugs & Future Ideas
Last updated: March 29, 2026

---

## 🐛 BUGS (Fix These First)

### BUG-001 — Supabase Sync Not Working
**Status:** Open  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** Supabase sync dot turns red after saving a roast. No sync attempts appear in Console. The `.env` variables are likely not being read correctly by the app.  
**Fix:** Check `supabaseClient.js` env var reading, add `console.log` to `syncRoastToSupabase`, verify `handleStop` is calling sync, confirm `.env` is in project root not `src/`.  
**Windsurf prompt:** Ready in PRD Section 4.1

---

### BUG-002 — Edit Roast Timestamps Show Raw Seconds
**Status:** Open  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** In the History tab Edit Roast view, timeline entry timestamps display as raw seconds (e.g. `634`) instead of MM:SS format (e.g. `10:34`). Once the edit is saved and you return to the detail view, they display correctly in MM:SS.  
**Fix:** Apply `formatTime()` to timestamp display fields in the edit mode view of the roast timeline.

---

### BUG-003 — Brew Tab Photo Button Non-Functional
**Status:** Open  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** The "Tap to add photo" button in the Brew Setup screen does nothing on iPhone. Should open camera or photo library.  
**Fix:** Implement a file input with `accept="image/*" capture="environment"` to allow camera and photo library access on iPhone. Store image as base64 in the brew tasting object.

---

### BUG-004 — Fruity Sub-Category Only Allows Single Selection
**Status:** Open  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** In the Brew tasting wizard Step 3, when Fruity is selected, only one sub-category (Berry, Citrus, Stone Fruit, etc.) can be expanded and selected at a time. A coffee can have both Berry AND Citrus notes so multiple sub-categories should be selectable simultaneously.  
**Fix:** Change `expandedFruitType` from a single string to an array so multiple fruit sub-types can be expanded and selected at once.

---

### BUG-005 — Profile Builder Steps Add to Top Instead of Bottom
**Status:** Open  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** When adding a new step in the Profile Builder, it appears at the top of the list instead of the bottom. This makes it difficult to build profiles in chronological order.  
**Fix:** Change the `addStep` function to append new steps to the end of the array instead of the beginning.

---

### BUG-006 — Profile Builder Heat/Fan Fields Allow Values Over 9
**Status:** Open  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** Heat and Fan input fields in the Profile Builder accept numbers greater than 9. The SR540 only goes from 1-9.  
**Fix:** Add `min="1" max="9"` to the Heat and Fan number inputs in the Profile Builder component.

---

## 💡 FUTURE IDEAS / IMPROVEMENTS

### IDEA-001 — Brew Tasting: Improved Acidity & Body Scale Labels
**Priority:** Medium  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** The current acidity scale (Flat/Low/Medium/Bright/Vibrant) and body scale (Watery/Light/Medium/Full/Syrupy) labels could be improved. "Light/Medium/Full" for body feel generic. Ask Casey for preferred terminology before implementing.  
**Note:** ASK QUESTIONS before fixing.

---

### IDEA-002 — Brew Tasting Step 4: Show All Notes + Add Acidity/Body
**Priority:** Medium  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** Step 4 of the tasting wizard currently only shows the top 5 flavor descriptors. Should show all selected notes. Also, acidity and body scores are completely missing from Step 4 — they should be displayed here. The tasting label card design should incorporate this info elegantly.  
**Note:** ASK QUESTIONS before fixing to get the layout right.

---

### IDEA-003 — Profile Builder UX Redesign
**Priority:** Medium  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** The Profile Builder is confusing to use. The profile name placeholder "e.g. Light Roast" implies it's for roast level which is misleading. The whole UX flow needs rethinking.  
**Note:** ASK QUESTIONS before fixing — need to understand what Casey wants from this feature.

---

### IDEA-004 — Profile vs Actual: Show Manual Changes
**Priority:** Medium  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** The Profile vs Actual section in the History roast detail view only shows profile-planned steps. Manual adjustments made during the roast that deviate from the profile are not shown. Should show "No changes made to profile" if followed exactly, or log deviations if changes were made.  
**Note:** ASK QUESTIONS before fixing.

---

### IDEA-005 — Brew Tab Custom Ratio Free Text Field
**Priority:** Low  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** When "Custom" is selected in the Ratio dropdown in the Brew Setup tab, a free text field should appear so the user can type in their custom ratio.  
**Fix:** Add a conditional text input that shows when `brewRatio === "Custom"`.

---

### IDEA-006 — Beans Tab: Log a Session Button
**Priority:** Medium  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** In the Bean Detail view, add a "Log a Session" button in the Roast Sessions section that pre-fills the Roast tab with the bean name and any relevant data, then navigates to the Roast tab.  
**Fix:** On tap, set `beanName` state to `selectedBean.name`, navigate to Roast tab via `setActiveTab("Roast")`.

---

### IDEA-007 — Settings Tab: Export Data
**Priority:** Medium  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** The Export Data button in Settings should open a menu allowing the user to choose file format: CSV (roast log data), XLSX (spreadsheet), PDF (full roast summary with charts). Need to clarify exactly what data should be in each format.  
**Note:** ASK QUESTIONS before implementing.

---

### IDEA-008 — Settings Tab: Light Mode
**Priority:** Low  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** Add a light/dark mode toggle in Settings. Light mode should be colorful and distinct from the dark zinc theme. Casey wants to be involved in the design.  
**Note:** ASK QUESTIONS before implementing — Casey wants input on color scheme.

---

### IDEA-009 — Settings Tab: Units of Measure
**Priority:** Low  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** Add a units of measure setting — toggle between Fahrenheit/Celsius for temperature, grams/ounces for weight.

---

### IDEA-010 — Settings Tab: About Screen
**Priority:** Low  
**Found:** March 29, 2026 (iPhone test session)  
**Description:** The About button in Settings currently does nothing. Should display app info, version number, and other relevant details.  
**Note:** ASK QUESTIONS before implementing — need to know what Casey wants to display.

---

## ✅ RESOLVED BUGS

| Bug | Description | Fixed |
|-----|-------------|-------|
| formatMMSS hoisting | RoastDetailChart crash on load | March 28, 2026 |
| Beans tab roastDetail crash | Referenced .milestones/.adjustments instead of .roastLog | March 29, 2026 |
| Gray screen / Tailwind | CSS not loading on initial setup | Early session |
| Weight loss showing NaN | greenWeight/roastedWeight saved as strings | March 28, 2026 |
