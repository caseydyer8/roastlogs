# Claude Code Playbook — lessons from your usage insights

Generated 2026-07-10 from `/insights` (sessions 2026-05-31 → 2026-07-06) plus
direct session history. Everything referenced here is prepared and awaiting
your review — nothing is committed or active until you say so.

---

## 1. What was prepared for you

| File | What it is |
|---|---|
| `CLAUDE.md` | Project conventions loaded into every session — Fan/Heat/Temp order, stepAfter rule, 3-place version bump, deploy flow, RLS-pending warning |
| `.claude/skills/release/SKILL.md` | `/release` — the whole bump→build→commit→push→deploy→verify pipeline in one command |
| `.claude/skills/deploy-check/SKILL.md` | `/deploy-check` — proves the live site actually serves the new bundle (not just HTTP 200) |
| `.claude/skills/rls-audit/SKILL.md` | `/rls-audit` — verifies actual RLS state on Supabase, not intended state |
| This file | Lessons + proposed hooks (below) |

---

## 2. Broad themes (the "wide" view)

**✅ What's working — keep doing it**
- Ship-oriented sessions that end in a deployed, versioned release.
- Defense-in-depth instinct: auth + RLS + gitignore in one pass.
- Letting Claude own the full pipeline (build/commit/deploy) instead of
  copy-pasting commands yourself.

**⚠️ Habit 1 — Unconfirmed completion (your biggest gap)**
Your auth/RLS session ended "mostly achieved" because nobody verified the
result. A clean build is not a working feature. Fixes now in place:
`/deploy-check` after every deploy, `/rls-audit` before shipping auth changes.
Rule of thumb: **a task isn't done until something observed it working** — a
curl, a screenshot, a phone-test, a policy query.

**⚠️ Habit 2 — The RLS migration has been pending for over a month**
`docs/enable_rls.sql` was written ~June 5 and still hasn't been run — meaning
your deployed app's data has RLS OFF right now. This is the single highest-
value 10 minutes on your list. Run `/rls-audit` to confirm state, then apply
the migration (the Supabase MCP connection can do it directly).

**⚠️ Habit 3 — Multi-goal session sprawl**
Bundling chart fix + reorder + picker + release into one session works, but
when something regresses you can't isolate which change caused it. Keep
batching related work, but ask Claude for **one commit per logical change**
(which we did do this week — keep it up) and use TaskCreate-style checklists
for 3+ goal sessions so nothing lands half-done.

**⚠️ Habit 4 — Ad-hoc permission sprawl**
`.claude/settings.local.json` has accumulated hyper-specific one-off entries
(exact curl strings, one node one-liner). Run the built-in
**`/fewer-permission-prompts`** to replace them with a clean, prioritized
allowlist.

## 3. Deep cuts (the "deep" view)

- **The version lives in 3 places** (package.json, About modal, backup
  `appVersion`). This bit us once already — it's now encoded in CLAUDE.md and
  `/release` so it can't be forgotten.
- **Pushing main ≠ deploying.** The live site only updates via `npm run
  deploy` (gh-pages). Now in CLAUDE.md; `/release` does both.
- **CDN lag masquerades as a failed deploy.** HTTP 200 can be the *old*
  bundle. `/deploy-check` compares the live bundle hash against `build/` —
  that's the real proof.
- **Transient github.com network failures** happened twice; both succeeded on
  retry. `/release` encodes "check connectivity, retry once" before declaring
  failure.
- **Duplicate JSX blocks with different indentation** (the two timeline
  branches) means `replace_all` edits can silently miss one. Lesson encoded:
  after any "change everywhere" edit, grep to verify zero old occurrences.
- **Display reads by field name, never by position** — that's why the
  Fan/Heat reorder needed no data migration. Now a convention in CLAUDE.md.

## 4. Built-in skills you already have but haven't used

- **`/verify`** — runs the app and observes behavior; use before phone-tests.
- **`/code-review`** — reviews the branch diff for bugs before you deploy.
- **`/security-review`** — pre-push security pass; perfect before auth changes.
- **`/fewer-permission-prompts`** — cleans up the allowlist (see Habit 4).
- **`/simplify`** — worth running on App.js's 4300 lines someday.

## 5. Proposed hooks (review, then install via `/update-config`)

Hooks live in `.claude/settings.json`. These are **proposals** — not active.

**Hook A — auto-verify after every deploy** (closes the unconfirmed-completion
gap at the harness level: whenever any Bash command containing `npm run
deploy` finishes, curl the live site and report the status into the session):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import sys,json,subprocess; d=json.load(sys.stdin); c=d.get('tool_input',{}).get('command',''); sys.exit(0) if 'npm run deploy' not in c else print('LIVE CHECK: HTTP ' + subprocess.run(['curl','-sS','-m','20','-o','/dev/null','-w','%{http_code}','https://caseydyer8.github.io/roastlogs/'],capture_output=True,text=True).stdout)\""
          }
        ]
      }
    ]
  }
}
```

**Hook B — block commits that stage `build/` or env files** (guards the
"never commit build artifacts or secrets" rule mechanically):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import sys,json,subprocess; d=json.load(sys.stdin); c=d.get('tool_input',{}).get('command',''); sys.exit(0) if 'git commit' not in c else 0; s=subprocess.run(['git','diff','--cached','--name-only'],capture_output=True,text=True).stdout; bad=[f for f in s.splitlines() if f.startswith('build/') or f.endswith('.env') or '.env.' in f]; (print('BLOCKED: staged forbidden files: '+', '.join(bad), file=sys.stderr), sys.exit(2)) if bad else sys.exit(0)\""
          }
        ]
      }
    ]
  }
}
```

*Deliberately not proposed:* a Prettier format-on-edit hook (the insights
report suggested it, but this repo has no Prettier config — adding one would
reformat all 4300 lines of App.js and pollute every diff).

## 6. Suggested next actions, in order of value

1. Run `/rls-audit` and apply the pending RLS migration ← **do this first**
2. Review + commit `CLAUDE.md` and the three skills
3. Install Hook B (commit guard) via `/update-config`, then Hook A if you like it
4. Run `/fewer-permission-prompts` to clean up the allowlist
5. Try `/release` on your next version bump instead of asking manually
