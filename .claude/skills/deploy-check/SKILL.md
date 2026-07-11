---
name: deploy-check
description: Post-deploy verification for the live RoastLogs site — confirms the site is up, the new bundle actually shipped, and reports what to phone-test. Use after any deploy, or when the user asks "did the deploy work?"
---

# Deploy Check

Verify the deployed site actually reflects the latest build. This closes the
"unconfirmed completion" gap — never report a deploy as done on `Published`
alone.

## Steps

1. **Site up** — `curl -sS -m 20 -o /dev/null -w "%{http_code}"
   https://caseydyer8.github.io/roastlogs/` → require 200.

2. **Correct bundle** — extract the hashed bundle name from the live HTML and
   compare with the local build:
   ```bash
   curl -sS -m 20 https://caseydyer8.github.io/roastlogs/ | grep -oE 'main\.[a-f0-9]+\.js' | head -1
   ls build/static/js/ | grep -oE 'main\.[a-f0-9]+\.js' | head -1
   ```
   If they differ, the CDN hasn't propagated yet — wait ~60s and retry once
   before flagging a problem.

3. **Bundle loads** — curl the live JS bundle URL itself and require 200.

4. **gh-pages freshness** — `git log origin/gh-pages -1 --format='%h %ci'`
   after a `git fetch origin gh-pages`; confirm the timestamp is from this
   deploy.

5. **Report** — pass/fail per check, plus a short phone-test checklist of
   what changed in this release (pull from the latest commit messages) so the
   user knows exactly what to tap through on the real SR540 before calling it
   verified.
