# Working with Claude Code — Casey's personal guide

Companion to `claude-code-playbook.md`. That file says *what* to fix in your
workflow; this one says *how to talk to Claude* day-to-day.

---

## 1. The mental shift from your Windsurf era

Your old loop: describe the app to chat-Claude → get a prompt → paste it into
a code tool → paste results back. **That translation layer is gone.** Claude
Code reads your actual files, runs your actual build, and sees your actual git
history. So:

- **Don't describe your code — point at it.** "The picker in the profile
  builder" is enough; I'll find it.
- **Don't write instructions for HOW to code it.** Describe the outcome you
  want and the rules that matter. The how is my job.
- **Don't re-explain the project.** `CLAUDE.md` now loads automatically every
  session — stack, conventions, deploy flow, data shapes are already known.

## 2. You already wrote a gold-standard prompt (keep doing this)

Your chart-fix prompt from July had all five load-bearing elements:

| Element | What you wrote |
|---|---|
| Context/root cause | "two components shared this filename; the wrong one is in place" |
| Numbered tasks | copy → verify → check App.js → build → summarize |
| **Verification with expected values** | "wc -l (expect 360)… grep (expect 0). Stop and tell me if any check fails" |
| Hard rules | "heat/fan MUST use stepAfter (never smoothed) — this is a hard rule" |
| Stop point | "Do NOT commit yet… I need to phone-test first" |

That structure is why the session went perfectly. You don't need all five
every time — but know which ones each task needs:

- **Tiny tweak** → just the goal: *"The × button on the discard modal is too
  small to tap on mobile — make it bigger."*
- **Feature** → goal + hard rules + verification + stop point.
- **Big/risky change** → add: *"Enter plan mode and show me a plan before
  writing any code."*

## 3. Your three habit-fixing phrases (from the insights report)

**Habit: moving on before anything was verified.**
> End feature prompts with: *"…then prove it works — show me the check output,
> not just 'done'."*

**Habit: multi-goal sessions where something lands half-done.**
> Start big sessions with: *"Make a task list first and check items off as you
> go so we both see what's left."*
> And: *"One commit per logical change."*

**Habit: manually walking me through build/deploy every time.**
> Just say `/release` (or `/deploy-check` after any deploy). The skills you
> reviewed encode the whole flow, including the 3-place version bump.

## 4. Things you're allowed to do (people underuse these)

- **Interrupt me.** Hit Esc mid-task and redirect. Cheaper than letting a
  wrong direction finish.
- **Be blunt.** "That's wrong, revert it" is a great prompt. No politeness
  tax, no hurt feelings.
- **Ask me to ask.** You did this once ("if you need to ask questions please
  do") — it works. Use it on any vague idea.
- **Ask me to teach.** *"Explain what you just changed like I'm going to
  maintain it myself"* — turns vibe-coding into learning.
- **Ask for options before code.** *"Give me 2–3 approaches with trade-offs,
  recommend one, don't write code yet."*

## 5. Ready-to-use prompts for your actual roadmap

Copy, paste, edit the brackets. Ordered by the priority we agreed on.

**① Supabase data sync (the big one — do in plan mode)**
> Enter plan mode. Roasts and tasting notes already sync to Supabase
> (syncService.js), but beans, profiles, and photos are still localStorage-only
> and would be lost with the device. Extend sync to cover them. Requirements:
> works offline during a live roast and syncs after; existing localStorage
> data migrates up on first login; localStorage stays as the fallback/cache.
> Show me the plan including table schema and RLS policies before any code.

**② RLS migration (10 minutes, overdue)**
> /rls-audit — then if the audit confirms RLS is off, apply
> docs/enable_rls.sql via the Supabase connection and re-verify.

**③ Error boundary**
> Add a top-level React error boundary. If the app crashes mid-roast it must
> show the elapsed timer and a "your data is saved" recovery screen instead of
> a white screen — a live roast must never be lost to a render error. Verify
> by temporarily throwing inside a component and showing me it recovers.

**④ Tests for the roast math**
> Extract the pure functions (RoR calc, DTR, phase durations, MM:SS
> parse/format, the monotone interpolator) so they're importable, then write
> unit tests using a realistic roastLog fixture — remember it's newest-first
> with mixed entry types and possible empty-string temps. Run the tests and
> show me the output. Don't change any math.

**⑤ Extract a component from App.js (repeatable — one per session)**
> Extract [ProfileBuilder] from App.js into src/components/ with zero behavior
> change. Then run the build AND /code-review on the diff before showing me.

**⑥ Roast comparison overlay (the fun one)**
> Plan mode: I want to overlay two roasts of the same bean on one chart to
> compare curves. Same hard rules as always — temp monotone, heat/fan
> stepAfter. Propose how selecting the comparison roast should work in the
> History tab UI before building.

**⑦ CRA → Vite (when builds annoy you enough)**
> Migrate this app from create-react-app to Vite. Keep the gh-pages deploy
> working with the same homepage path. Verify with a production build AND
> /deploy-check against a test deploy before I phone-test.

**⑧ Mid-roast bug report (from your phone, claude.ai/code)**
> Bug found during a real roast: [what happened] at [when — e.g. right after
> FIRST CRACK was logged]. Expected [X], saw [Y]. Investigate and propose a
> fix but don't commit — I'll review when I'm back at the laptop.

## 6. The one-line summary

**State the outcome, the hard rules, the proof you want, and where to stop.
Let Claude find everything else in the repo.** You already did it once
perfectly — now it's just a habit.
