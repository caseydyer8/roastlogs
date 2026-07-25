# Workflow & Sessions — How Case Actually Builds

> The mechanics of a good session with Case, and the rituals that protect his time and his builds. This is the file that most directly serves his year-from-now goal: stop losing time to re-orientation loops and point the work precisely.

---

## The core rhythm: Plan → Read → Build → Verify → Iterate

Case works in a **Plan-then-Code** loop. It's not optional decoration — it's how he thinks, and it's where he has the most leverage and the most understanding.

1. **Plan.** Case brings a problem into a planning session. Talk it through, then draft a plan as an `.md`.
2. **Read the plan until it sounds right.** *(This is a hard gate — see below.)*
3. **Build.** Execute the polished plan, using the agent bundle (see `03-agents-and-process.md`).
4. **Verify against intent and non-breakage** *(see the verification standard below).*
5. **Iterate.** If it's broken, go back — sometimes all the way back to planning.

**The plan is the product. The code is just the plan compiled.** This is the single most important principle in working with Case. His leverage lives at the planning gate.

## Hard rule: the plan gate

**No build executes until Case has read the plan back and confirmed it matches his intent.**

This rule was learned the expensive way — Case once sent a build plan he hadn't fully read, and it wiped part of RoastLogs and broke functionality for a while. He now reads, re-reads, and corrects the `.md` until it matches what he actually wants before any code is written.

Enforce this actively. Before executing a plan:
- Confirm Case has actually read it, not skimmed it.
- Call out anything destructive, irreversible, or that touches existing working functionality **in plain language, up top, before he says go.**
- If a plan is large, summarize the blast radius: *what will change, what could break, what's irreversible.*

## Verification standard: intent + non-breakage, not syntax

Case's discipline is strongest at the planning gate and lightest at the execution gate — and that's *correct* for how he operates. He can't always parse code line-by-line, so "trust but verify" for him does **not** mean "read every diff." His military doctrine is *"always trust and always verify"* — the refinement is being deliberate about **what** verify checks.

His achievable, every-time verification standard is:
- **Did the thing I asked for actually happen?** (intent)
- **Did anything that used to work stop working?** (non-breakage)

Give him what he needs to check *those two things* after every build — a plain-language summary of what changed and what to test. Don't hand him a wall of code and call it verification. Hand him an intent-and-breakage checklist he can actually run.

## Session start ritual (make this fast and reliable)

Case's existing re-orientation habit — pull the repo, get a fresh picture of where the build stands, review the last planning chat, then proceed — is good, but it's improvised and lives in his head, which is where the time-wasting loops come from. Make it a crisp, repeatable open:

**At session start:**
1. Pull the repo / get current state.
2. State back, in 3-4 lines: *where the build is, what the last decision was, what's the immediate next step.*
3. Confirm with Case that the picture matches his memory before proceeding.

The goal (his words): point the work precisely with the right terminology and never miss a beat. A tight, consistent open is how the re-orientation loop dies.

## Session PAUSE protocol (this one is critical)

Case builds in stolen evening hours. Becca is often home. Sessions can — and should — end abruptly so he can be present with his wife. Abrupt endings are the most dangerous moment in his workflow, because coming back cold burns his scarce time and raises the odds of a plan-not-read mistake.

**When Case needs to stop — or when it's clear he should go be with Becca — drop a pin in under 60 seconds:**
- One line: *what we were doing.*
- One line: *the exact next step when he returns.*
- One line: *anything half-finished or in a fragile state.*

Keep it that short. The point is that he can close the laptop guilt-free and pick up clean later. **Protecting the marriage and protecting the build are the same move here.** If Case seems torn between finishing a thought and going, gently make the call for the pause — it's almost always the right one.

## Right-sizing the process

Not every change needs the full orchestra. Case learned that the ceremony stopped feeling like overhead the moment he stopped fighting the system he built. For small, low-risk changes, a lightweight loop is fine. Reserve the full plan-and-agent-chain for anything that touches architecture, data, security, or existing working functionality. See `03-agents-and-process.md` for the agent side of this.
