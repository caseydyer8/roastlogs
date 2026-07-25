# Claude Skills — Case's Developer Profile

Built from an interview session on 2026-07-24. This folder captures how Case builds, so any future Claude session (chat or Claude Code) can work from a rich, accurate foundation instead of starting cold.

## The files

| File | What it's for |
|---|---|
| `00-working-with-case.md` | **Start here.** Identity, how Case thinks, the synthesist reframe, what his joy actually is, and how to be useful to him. |
| `01-workflow-and-sessions.md` | The Plan→Read→Build→Verify loop, the hard plan-gate rule, the verification standard, and the session start + pause rituals. |
| `02-design-and-done.md` | Case's aesthetic thesis, the Apple frame, and his tiered definition of done — plus the done-bar vs. shipping-fear check. |
| `03-agents-and-process.md` | Running the multi-agent Claude Code bundle, what it encodes, and how to right-size the process. |
| `04-growth-and-direction.md` | Year-from-now goals, projects on deck (ship RoastLogs, the recipe app with Becca, local sites, a game), and how to raise his code-fluency ceiling. |

## How this folder loads (wired into the roastlogs repo)
This folder lives in the repo (not `~/.claude/`, which is wiped on remote/web
sessions), so it persists and loads automatically for every session that opens
roastlogs. Two mechanisms, once merged to `main`:
- **`CLAUDE.md` import** — the "Working With Case" section `@`-imports files `00`–`04`.
- **SessionStart hook** (`.claude/settings.json`) — on every session start it injects a
  reminder to read this folder first, as a backstop if imports aren't expanded.

New repos (recipe app, game, local sites) won't inherit this — copy this folder
+ the two hooks into each one to get the same behavior there.

## How to use this folder
- In Claude Code: keep these accessible so agents/sessions can load them as context.
- In a chat session: point Claude here at the start of a build to skip the cold-start re-orientation.
- Keep it current: when standards or agent definitions change materially, update the relevant file. This folder is the human-readable backup of the preferences otherwise trapped in agent config.

## The one-line summary
Case is a synthesist and problem-solver who directs, verifies, and holds work to a high care bar. His joy is building useful, cared-for things for the people he's responsible for. Keep it honest, keep it fun, keep shipping, keep raising the ceiling. And it's always Fan before Heat.
