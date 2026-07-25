# Design & Definition of Done — Case's Standards

> Case's taste is a real, teachable thing, not vibes. This file makes his aesthetic and his "done" bar into rules you can build against. When in doubt about a design decision, this file has the answer he'd give.

---

## The design thesis (his words)

> **"Fill the space, and fill it intentionally — that adds value."**

This is the whole philosophy in seven words. It threads a specific needle between the two failure modes Case actively hates:

- **NOT the cluttered panel.** Too much detail crammed into one space clogs it, makes it hard to read, and causes *decision fatigue*. (His frame: the over-configurable Android settings menu.)
- **NOT the empty white box.** A white screen with white dropdowns is boring, plain, and hard to parse. Looking "like everything else on the market" is a design sin to him, not a safe default.

The target is **generous, calm, deliberate use of space, with enough visual character that it feels authored.** Every element earns its place.

## The Apple frame — read it correctly

Case admires Apple/iPhone: clean, sleek, easy to use, rarely breaks, never makes you think. But the thing he values is **not minimalism for its own sake** — it's that constraint *serves the user*. Fewer options, less adjustability, but zero cognitive tax.

The rule that falls out of this:

> **When in doubt, remove the option — not the polish.**

Case would rather ship an opinionated, beautiful default than a configurable panel that's ugly. Don't solve a design tension by adding a setting. Solve it by making a confident, well-crafted choice.

He describes the same quality in why he prefers Claude over other AIs: it *feels* nice, it looks cool, and it functions the way he wants. "Feel" is a first-class requirement, not a nice-to-have.

## What "authored" looks like (reference: RoastLogs v2 Roast tab)

Case's own work is the clearest spec. The v2 Roast tab demonstrates his taste concretely:
- Large tabular/split-flap style numerals for the roast timer — stylish numbers, not default fonts.
- `FAN` before `HEAT` (his required order), with segmented level indicators.
- A live temp reading with a subtle "rising" state.
- A roast-phase rail (Start → Yellowing → First Crack → Drop) with the active phase emphasized and future phases ghosted.
- A warm burnt-orange curve on a dark, warm ground — a real palette with a point of view.
- Small confidence signals like a "SYNCED" status dot.

The takeaway for any UI built with Case: **it should look like a person with artistic skill spent real time on it.** Deliberate type, a real palette, calm spacing, meaningful state indicators, no chart junk.

## Definition of Done — tiered

Functioning is the **floor**, never the finish line. Case will not call something done — and will not put his name on it publicly — until it clears the care bar. His two tiers:

### Floor — "ship to myself"
- It functions.
- He can't break it.
- Nothing that used to work regressed.

### Bar — "ship to another roaster / make it public"
- Everything in Floor, **plus:**
- The flows are clean end-to-end between all functions.
- The UI is calm, legible, easy on the eyes, not distracting.
- **It feels authored** — like someone kept working on it until it was right, with evidence of care a user can *feel*.

His real definition, verbatim: *"it feels like something someone actually kept working on until it was right."*

## The done-bar / shipping-fear check

Case's high bar is mostly a virtue — it's *why* RoastLogs looks the way it does. But it can also become a place shipping-fear hides, because "genuinely not cared-for enough yet" and "scared to put my name on it" feel *identical from the inside.*

When Case says something "isn't done," help him name the gap **specifically**:
- If he can point to concrete, nameable failures against the care bar → it's genuinely not done. Keep refining.
- If the objections get vague, or the punch-list is short and shippable and he keeps not shipping → that's likely fear, not standards. Say so, gently, with the evidence.

*(Live example from the interview: Case described RoastLogs as needing only to open the database for other users, tighten security, and test the bean inventory tracker — a short, nameable punch-list — while also saying it "isn't ready." That's the fear pattern, not the standards pattern.)*

## Quick design defaults for Case

- Dark, warm grounds over stark black-on-white.
- A real, restrained palette with an accent that carries meaning (RoastLogs uses burnt orange).
- Stylish, intentional typography — especially for numbers and key readouts.
- Calm spacing; let things breathe.
- Meaningful state/status indicators over decoration.
- Fan before Heat, always.
- If a screen looks generic, it's wrong — even if it works.
