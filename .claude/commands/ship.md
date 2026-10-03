---
description: Pre-ship gate. Fans out code-reviewer, security-auditor and test-writer IN ONE TURN so they run in parallel, merges their results, and returns GO / NO-GO. Refuses GO without a rollback plan. Never deploys where RL_CAN_DEPLOY is not yes.
---

Flat fan-out, modelled on `addyosmani/agent-skills` (MIT, commit `be4e44a`):
independent personas dispatched together, no persona calls another, and the
merge happens here in the main context.

## 1. Pre-flight refusals — check these BEFORE dispatching anything

Each is a **NO-GO** on its own. Report every one that fails, not just the first.

1. **Rollback plan.** Case (or the change's ledger item) must supply one with
   all three parts:
   - **Trigger conditions** — the observable that means "roll back now" (e.g.
     any signed-in read returns an error; live bundle version wrong; bridge
     `CHANNEL_ERROR`).
   - **Exact procedure** — commands or SQL, in order, copy-pasteable. For a
     front-end release: redeploy the previous tag. For a database change: the
     reverse statement, and the `authenticated`-role check that proves it.
   - **Recovery time objective (RTO)** — how long the site may stay broken
     before the rollback must be complete.
   Missing any part → NO-GO. Non-negotiable: the 2026-09-07 recovery was
   improvised because no plan existed.
2. **Ledger integrity.** `node .claude/tools/ledger.js validate` must pass, and
   no item may be `done` with an empty `acceptance`.
3. **Verify state is current.** `.claude/hooks/state-hash.sh` must equal
   `.session/verified-hash`. If not → NO-GO: run `verify.sh` first.
4. **No visual debt.** No ledger item may carry `visual_pending: true`
   (`node .claude/tools/ledger.js list --json`).

## 2. Fan-out — ONE turn, three Agent calls

Dispatch **code-reviewer**, **security-auditor**, and **test-writer** as three
`Agent` tool calls **in the same assistant message**. Separate messages
serialize them. Give each the same range (`origin/main..HEAD` unless told
otherwise) and nothing about the others.

**Measure, don't assume.** Immediately before the turn, and when each result
returns, record a wall-clock timestamp (`date -u +%H:%M:%S`) and each agent's
reported `duration_ms`. Report:

- start/end per agent, and the total wall time for the fan-out;
- **parallel** if total ≈ the slowest single agent; **serialized** if total ≈
  the sum of all three.

## 3. Merge

- **code-reviewer:** any `blocking` → NO-GO.
- **security-auditor:** any HIGH/CRITICAL → NO-GO. Its findings are tier 3:
  route them to `findings/pending/` via doubt-reviewer, never straight to the
  ledger.
- **test-writer:** any failure → NO-GO, and a regression is tier 1 — open it at
  its reported severity.
- Any `could_not_verify` entry is listed in the report, verbatim.

## 4. Verdict

`GO` only if every refusal passed and all three personas are clean. Otherwise
`NO-GO` with the reasons, most severe first.

**GO is not a deploy.** Deploy only where the briefing reports
`deploy=yes` (`RL_CAN_DEPLOY=yes` from `.claude/hooks/machine-profile.sh`) —
Case's Mac. Anywhere else, stop at GO and tell Case to run `/release` on the
Mac. After any deploy, spawn **deploy-verifier**.
