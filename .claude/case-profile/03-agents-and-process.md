# Agents & Process — Running the Multi-Agent Setup

> How Case works with his Claude Code subagent bundle, what that bundle actually encodes, and how to keep it healthy. This is a real asset with a real dependency worth protecting.

---

## The setup

Case runs a full subagent bundle in Claude Code — planner, explorer, implementer, test-writer, code-reviewer, security, UX/UI, documentation, and others. This evolved from an earlier seven-role architecture (PM orchestrator, developer, engineer, security tester, security implementation, marketing, UX/UI).

## How Case actually operates the agents (trust arc)

Case's relationship to the agents matured on a clear arc, and where he landed is *correct* for him — don't push him backward:

- **Early:** hovered and watched every stage like a hawk, white-knuckling.
- **Now:** lets the agents run, then reads the output afterward to confirm intent was met. He often can't fully parse what an agent is doing live in the window, and that's fine — he verifies the *result*, not the *process*.

His doctrine, from the military: **"always trust and always verify."** For agents this means: let them run, then verify against intent and non-breakage (see `01-workflow-and-sessions.md`), not against every line.

**Key insight — do not let him backslide:** the ceremony stopped feeling like overhead the moment Case got *less* ingrained in the mechanical detail and started trusting the system he designed. His work got *better* when he stepped back. If he starts hovering and micromanaging agents again, that's usually a signal of stress or lost trust, not a real need — gently point back to the system he built.

## Where his attention naturally goes

Case reads agent *output/summaries* to confirm what he wanted happened. He does not scrutinize individual agents line-by-line and mostly trusts the green light, because he's confident the agents he built do a good job and adhere to his expectations.

Implication: **the agents' adherence to his standards is what's protecting him**, since he's not deeply inspecting the code. So the quality bar for agent output has to be high, and the security and non-breakage checks especially have to be genuinely reliable — he's trusting them. When an agent flags something real, surface it clearly and in plain language; don't bury it.

## The agents are institutional knowledge — protect them

This is important and under-appreciated: **Case's agent definitions encode his working standards** — his F-before-H formatting, his aesthetic bar, his security posture, how he likes to work, what "done" means. The agents "know how he likes to work," in his words.

That means the bundle is a repository of his preferences. If it ever gets corrupted, or he rebuilds his setup, that knowledge walks. Two safeguards:
- **This `Claude Skills` folder is the human-readable backup of those standards** — the preferences that would otherwise be trapped only in agent config. Keep it current.
- When agent definitions change materially, consider whether the change should also be reflected here (and vice versa).

## Right-sizing: when the full orchestra is overkill

Knowing when *not* to run the whole chain is its own skill. Guidance:

- **Full chain** (plan → implement → test → review → security → docs): anything touching architecture, data/database, security, or existing working functionality. Anything with real blast radius.
- **Lightweight loop**: small, isolated, low-risk changes where the full ceremony would be more overhead than value.

The overhead was never the agents — it was fighting them. Match the process weight to the *risk and blast radius* of the change, not to habit.

## Security-specific note

Security is not a rubber-stamp step for Case even though he lets it run — it connects directly to his professional identity and mission (safe infrastructure, "stop the bad guy"). Give the security agent's findings real weight and clear presentation. As RoastLogs moves toward shipping (opening the database to other users), security review moves from background hygiene to a genuine gate. Treat it that way.
