\# RoastLogs — One-Time Branch Environment Setup

\# Run these commands ONCE in your Mac Terminal from /Users/casey/Documents/roastlogs

\# After this, you never touch main directly again. All agent work stays in session branches.



\---



\## Step 1 — Make sure you're up to date



```bash

cd /Users/casey/Documents/roastlogs

git pull origin main

git status

```

You should see "nothing to commit, working tree clean".



\---



\## Step 2 — Tag the current state of main as your safety snapshot



```bash

git tag snapshot-pre-dev-setup main

git push origin --tags

```



This creates a permanent recovery point. If anything ever goes wrong, you can always return here:

`git checkout main \&\& git reset --hard snapshot-pre-dev-setup \&\& npm run deploy`



\---



\## Step 3 — Create the develop branch



```bash

git checkout -b develop

git push origin develop

```



Now you have:

\- `main`    → production (what GitHub Pages serves right now)

\- `develop` → where tested agent work accumulates before going live



\---



\## Step 4 — Protect main on GitHub (do this in the browser)



1\. Go to https://github.com/caseydyer8/roastlogs/settings/branches

2\. Under "Branch protection rules", click "Add rule"

3\. Branch name pattern: `main`

4\. Check: "Require a pull request before merging"

5\. Check: "Do not allow bypassing the above settings"

6\. Click Save



This makes it physically impossible to accidentally push to main. You MUST use a PR to get code there.



\---



\## Step 5 — Set up the test/staging URL (GitHub Pages from develop)



Currently GitHub Pages serves from `main`. You can also serve a preview from `develop`:



Option A (simplest — test on localhost, deploy only reviewed work):

&#x20; No extra setup needed. Just run `npm start` on your session branch to test locally.

&#x20; Only run `npm run deploy` from `main` after you've reviewed everything.



Option B (GitHub Pages staging URL — more involved):

&#x20; Create a second GitHub Pages deployment from the `develop` branch.

&#x20; Go to repo Settings → Pages → change Source to "develop" branch temporarily when testing.

&#x20; Switch back to "main" for the real deployment.

&#x20; Note: You only get one GitHub Pages URL per repo on the free plan.



RECOMMENDATION: Use Option A. Your localhost:3000 IS your test environment.

&#x20; The pipeline is: session branch (agent work) → localhost test → develop → localhost test → main → npm run deploy



\---



\## Step 6 — Add .env.development.local for iPhone testing (if not already done)



```bash

echo "HOST=0.0.0.0" >> .env.development.local

```



This lets your iPhone reach localhost:3000 over WiFi. Find your Mac IP with:

```bash

ipconfig getifaddr en0

```

Then on iPhone Safari: http://\[that-ip]:3000



\---



\## Your ongoing workflow after this setup



```

Every session:



1\. Terminal Tab 1 (leave running):

&#x20;  cd /Users/casey/Documents/roastlogs

&#x20;  git checkout session/YYYYMMDD-\*   ← whatever branch the agent created

&#x20;  npm start                          ← dev server, hot reload



2\. Review changes in browser at localhost:3000

3\. Test critical flows on iPhone via local IP



4\. Terminal Tab 2 (git commands):

&#x20;  # If everything looks good:

&#x20;  git checkout develop

&#x20;  git merge session/YYYYMMDD-\*

&#x20;  

&#x20;  # Final check on develop:

&#x20;  git checkout develop \&\& npm start

&#x20;  

&#x20;  # When ready to go live:

&#x20;  git checkout main

&#x20;  git merge develop

&#x20;  npm run deploy

&#x20;  

&#x20;  # Clean up session branch:

&#x20;  git branch -D session/YYYYMMDD-\*



Emergency rollback (if anything breaks on live):

&#x20;  git checkout main

&#x20;  git reset --hard snapshot-before-session-YYYYMMDD

&#x20;  npm run deploy

```



\---



\## Summary of what you now have



```

main ─────────────────────────────────────────────► GitHub Pages (live app)

&#x20;│

&#x20;└─ snapshot-pre-dev-setup (permanent tag — original safe state)

&#x20;└─ snapshot-before-session-YYYYMMDD (tagged before each agent session)



develop ──────────────────────────────────────────► reviewed, tested staging

&#x20;│

&#x20;└─ session/YYYYMMDD-bugs-and-features  ← agent works here

```



You can always recover. You can always rollback. Agent never touches main.

