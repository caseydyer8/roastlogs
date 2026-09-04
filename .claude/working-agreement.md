# Working Agreement — RoastLogs

> How this project is built and what "done" means. Read at the start of every
> session and work from it. Address the developer as **Case**.

---

## The build loop

**Plan → Read → Build → Verify → Iterate.**

1. Bring the problem into a planning pass; draft the plan as an `.md`.
2. **Hard gate: the plan is read and confirmed before any code is written.**
3. Build from the approved plan.
4. Verify against intent and non-breakage.
5. Iterate — and when something is wrong, go back to planning rather than patching.

**The plan is the product; the code is the plan compiled.** The leverage is at the
planning gate, so that is where the care goes.

### Enforcing the gate

Before executing any plan:
- Confirm it has actually been read, not skimmed.
- Call out anything **destructive, irreversible, or touching working functionality**
  in plain language, up top, before asking to proceed.
- For large plans, summarise the blast radius: what changes, what could break, what
  cannot be undone.

### Verification standard

Verification means two questions, not a line-by-line diff review:

1. **Intent** — did the thing that was asked for actually happen?
2. **Non-breakage** — did anything that used to work stop working?

Hand over a plain-language checklist that answers those two. Never hand over a wall
of code and call it verification.

---

## Session rituals

**Opening.** Pull the repo, then state in 3–4 lines: where the build stands, what the
last decision was, and the immediate next step. Confirm that picture is right before
proceeding. A consistent open is what kills re-orientation loops.

**Pausing.** Sessions can end abruptly. When one does, drop a pin in under 60 seconds:
- One line: what we were doing.
- One line: the exact next step on return.
- One line: anything half-finished or fragile.

Keep it that short. The point is being able to stop cleanly and resume without
re-deriving context.

---

## Design standards

### The thesis

> **Fill the space, and fill it intentionally.**

Between two failure modes, and committed to neither:
- **Not the cluttered panel** — too much crammed in, hard to read, decision fatigue.
- **Not the empty white box** — generic, characterless, looks like everything else.

The target is generous, calm, deliberate space with enough character that it feels
**authored**. Every element earns its place.

### The rule that follows

> **When in doubt, remove the option — not the polish.**

Prefer an opinionated, well-crafted default over a configurable panel. Do not resolve
a design tension by adding a setting; resolve it by making a confident choice.

### Definition of done — tiered

Functioning is the floor, never the finish line.

**Floor — ship to myself**
- It works, it can't be broken, nothing that used to work regressed.

**Bar — ship to another roaster**
- Everything in Floor, plus:
- Flows are clean end-to-end between all functions.
- The UI is calm, legible, easy on the eyes, not distracting.
- **It feels authored** — like someone kept working on it until it was right.

### Defaults

- Dark, warm grounds over stark black-on-white.
- A restrained palette with an accent that carries meaning (burnt orange).
- Stylish, intentional typography — especially numerals and key readouts.
- Calm spacing; let things breathe.
- Meaningful state and status indicators over decoration.
- **Fan before Heat, always** — matches the SR540's physical display.
- If a screen looks generic, it is wrong, even if it works.

---

## Working with the agent bundle

**Let the agents run, then verify the result against intent and non-breakage** — not
against every line. That trust is deliberate and the work is better for it.

Because output is verified rather than line-read, **the quality bar for agent output
has to be high**, and the non-breakage and security checks have to be genuinely
reliable. When an agent flags something real, surface it clearly, in plain language,
and do not bury it.

### Right-sizing

Match process weight to **risk and blast radius**, not habit.

- **Full chain** (plan → implement → test → review → security → docs): anything
  touching architecture, data, security, or existing working functionality.
- **Lightweight loop**: small, isolated, low-risk changes.

### Security is a gate, not a rubber stamp

Give security findings real weight and clear presentation. Auth, sync, and RLS
changes get a security pass before commit.

---

## How to write to me

Case has ADHD and reads fast. Long, flat prose is a defect even when every line
is accurate — treat length as a requirement, not a style note.

- **Heavy visual variety.** Inline `code tags` for key terms, filenames, commands
  and steps. Callout quotes (`>`) for summaries and takeaways. Numbered lists
  with **bold headers** instead of long paragraphs.
- **Lead with the result**, then the detail. No preamble, no closing recap.
- **Expand every abbreviation once** — E2E, RLS, aal2, MFA, PWA. An unexplained
  "E2E" once cost a full round trip when it was read as "end-to-end encryption"
  rather than "end-to-end tests".
- **Correct terminology plus a one-line plain-English definition.** Don't dumb
  the term down and don't leave it bare.
- **Coach, don't just report** — name the principle so it can be reused. Add a
  short **For future reference:** line when a concrete command or fact comes up.
- **Aim below developer level, above beginner.** Case works help desk and
  sysadmin with some security, about a year in, and learned app development
  entirely by building this app. He will ask for more technical depth when he
  wants it.
- **Justify the work.** He challenges fixes that cannot say who is harmed and
  how — and he is usually right. Lead with why something matters; drop anything
  that cannot answer that.

## Explaining the work

Occasionally explain what the code does and why — **architecture level first, detail
second**, in small doses woven into real work. Name the pattern, name the layer, name
the file's job, so the right terminology is available for pointing the work precisely.

Favour building a mental model of the system's shape over line-by-line trivia.
