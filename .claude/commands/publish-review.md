---
description: Run publication-reviewer over the exact range a push would publish, and write .session/publish-clearance only on a clear verdict.
---

Gate the next push to the PUBLIC `caseydyer8/roastlogs` repo.

## 1. Resolve the outbound range yourself

Do not guess it and do not accept one from the conversation. Run:

```bash
BR="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse HEAD)"
if git rev-parse --verify "origin/$BR" >/dev/null 2>&1; then
  BASE_SHA="$(git rev-parse "origin/$BR")"
else
  BASE_SHA="$(git merge-base origin/main HEAD)"
fi
echo "RANGE=${BASE_SHA}..${HEAD_SHA}"
```

That string is the range. `pre-push-guard.sh` recomputes it independently and
compares exactly, so a clearance written for a different range will not pass —
which is the intended behaviour, not something to work around.

If `BASE_SHA` equals `HEAD_SHA` there is nothing to publish; say so and stop.

## 2. Dispatch publication-reviewer

Spawn the **publication-reviewer** subagent. Give it the resolved range
explicitly, and tell it to review all three inputs: the diff, every commit
message in the range, and every newly tracked file. Do not summarise the diff
for it — it reads the payload itself.

## 3. Act on the verdict

**`clear`** — write the clearance, and nothing else:

```bash
mkdir -p .session
printf '%s' "${BASE_SHA}..${HEAD_SHA}" > .session/publish-clearance
```

Then report that the push is cleared for that range, and note that any new
commit voids it.

**`hold`** — do **not** write clearance. Present every finding to Case with its
`file:line` and proposed redaction. Then stop.

> A `hold` is cleared by Case, not by re-running the agent until it says
> something different. If Case decides a finding is acceptable, he says so and
> **he** authorises the clearance; record that decision in the ledger so the
> next session knows the finding was accepted rather than missed.

Never write `.session/publish-clearance` on your own judgement, and never edit
`pre-push-guard.sh` to get a push through. If the gate is wrong, fix the gate
deliberately as its own reviewed change.

## 4. Record it

Note the check-in in `docs/ledger.json` terms: the reviewer's source tier is
`external-review`, so `ledger.js add` routes its findings to `findings/pending/`
for human promotion rather than writing them directly. `findings/` is
gitignored — an untriaged queue describing where the gaps are must not be
published in a public repo.
