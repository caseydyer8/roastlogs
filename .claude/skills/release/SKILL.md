---
name: release
description: Full release flow for RoastLogs — bump version everywhere, build, commit, push, deploy to GitHub Pages, and verify the live site. Use when the user says "release", "ship it", or "deploy a new version".
---

# Release RoastLogs

Run the complete release pipeline. Stop immediately and report if any step
fails — never continue past a failure.

## Steps

1. **Preflight** — confirm working tree state with `git status --short`.
   If there are uncommitted source changes the user hasn't approved, list them
   and ask before proceeding. Never include `build/` or
   `.claude/settings.local.json` in a release commit.

2. **Version bump** — ask the user for the new semver (or infer patch/minor
   from the changes), then update ALL THREE version locations:
   - `package.json` → `"version"`
   - `src/App.js` → About modal badge (search for `v1.` near "About modal")
   - `src/App.js` → backup export `appVersion` field
   Verify all three match: `grep -n "appVersion\|version" package.json` and
   grep App.js for the badge.

3. **Build** — `CI=false npm run build`. Require "Compiled successfully".

4. **Commit** — stage only the intended source files, commit with a message
   describing the release (e.g. `Bump version to vX.Y.Z`).

5. **Push** — `git push origin main`. The repo is public, so this push is
   gated twice and needs a publish-clearance for the exact main range: run
   `git fetch`, then `/publish-review`, and push only after it writes
   `.session/publish-clearance`. The git pre-push hook
   (`.githooks/pre-push`, installed per clone by Case with
   `bash .claude/tools/install-push-gate.sh`) enforces this on Case's own
   terminal too, and the publication guard enforces it on Claude's push.
   Claude is not supposed to get around either, and the guard refuses the
   common spellings of trying; it is a speed bump, not a wall (see the Push
   gate block in CLAUDE.md). When the push is refused there are two
   different situations, with two different answers:
   - **Publication review NOT clear** -> fix what it found (reword or amend
     BEFORE pushing) and re-run `/publish-review`; never offer `--no-verify`
     for this. A hold is the gate working.
   - **The gate itself misfires** (shallow clone, stale origin after a failed
     fetch) -> tell Case, who may use `git push --no-verify` from his own
     terminal for that one push.

   `npm run deploy` in step 6 follows the Deployment / Release rules in CLAUDE.md
   (localhost review first, deploy-verifier after). Network hiccups to github.com are
   sometimes transient — retry once after checking connectivity with curl
   before declaring failure.

6. **Deploy** — `npm run deploy` (runs predeploy build + gh-pages publish).
   Require the log line `Published`.

7. **Verify live** — `curl -sS -m 20 -o /dev/null -w "%{http_code}"
   https://caseydyer8.github.io/roastlogs/` and require 200. Remind the user
   the Pages CDN takes 1–2 minutes; hard refresh or private window to see the
   new bundle.

8. **Report** — summarize: commit hash, version, push range, deploy status,
   live check result, and anything skipped.
