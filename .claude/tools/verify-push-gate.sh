#!/usr/bin/env bash
# verify.sh step 3: the push gate's end-to-end probes (test-push-gate.sh), run only when
# something they depend on has changed since the last PASS.
#
# WHY A CACHE. The probes take a couple of minutes (they spawn git and python thousands
# of times, slower still on Git Bash), and verify.sh runs on every commit and on every
# Stop-gate re-verify after any src/ edit, while the gate itself changes rarely. So the
# result is remembered, keyed by a hash of EVERYTHING the non-DOC probes read: the four
# gate files (.githooks/pre-push, the push guard, the installer, the harness),
# .gitattributes, the wiring the WIRE and CACHE probes check (session-start.sh,
# state-hash.sh, verify.sh, pre-commit-guard.sh, and this script), and the output of
# `git --version` (the probes exercise git itself). Those wiring files change rarely, so
# the price of keying on them is an occasional slow run; leaving them out let a weakened
# state-hash.sh or session-start.sh pass verify on an old result.
#
# WHAT KEEPS IT HONEST.
#   - The hash covers the CONTENT of those files, so any edit to a gate file misses the
#     cache and the probes run. A stale PASS cannot mask a changed gate file.
#   - The cache is written ONLY after a pass, and removed before every real run, so a
#     failing run leaves nothing behind that a later run could take for a pass.
#   - A failing harness fails this script (exit 1), and a missing harness fails too.
#   - PUSH_GATE_FORCE=1 runs the probes regardless; so does deleting
#     .session/push-gate-verified. The cache is per machine and per clone (.session/ is
#     gitignored).
# What the cache does NOT cover: the DOC probes (wording lint, excluded here on purpose)
# and a change to the machine the probes run on other than git's version.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 1
mkdir -p .session

HARNESS=.claude/tools/test-push-gate.sh
CACHE=.session/push-gate-verified
FILES=".githooks/pre-push .claude/hooks/pre-push-guard.sh .claude/tools/install-push-gate.sh $HARNESS .gitattributes .claude/hooks/session-start.sh .claude/hooks/state-hash.sh .claude/hooks/verify.sh .claude/hooks/pre-commit-guard.sh .claude/tools/verify-push-gate.sh"

if [ ! -f "$HARNESS" ]; then
  echo "FAIL: $HARNESS is missing, so the push gate cannot be checked."
  exit 1
fi

if command -v sha1sum >/dev/null 2>&1; then
  H=sha1sum
elif command -v shasum >/dev/null 2>&1; then
  H=shasum
else
  H=""   # no hasher: never skip, run the probes every time
fi

NOW=""
if [ -n "$H" ]; then
  NOW="$(
    {
      for f in $FILES; do
        printf '%s ' "$f"
        if [ -f "$f" ]; then "$H" < "$f" | cut -d' ' -f1; else echo absent; fi
      done
      git --version 2>/dev/null || echo no-git
    } | "$H" | cut -d' ' -f1
  )"
fi

if [ -n "$NOW" ] && [ -z "${PUSH_GATE_FORCE:-}" ] && [ -f "$CACHE" ] && [ "$(cat "$CACHE" 2>/dev/null)" = "$NOW" ]; then
  echo "    (push gate probes skipped: the gate files, the harness and git are unchanged since the last pass. PUSH_GATE_FORCE=1 or deleting $CACHE runs them.)"
  exit 0
fi

# A real run. Whatever the cache said before, it says nothing now until this passes.
rm -f "$CACHE"
if bash "$HARNESS" --quiet --exclude DOC; then
  [ -z "$NOW" ] || printf '%s\n' "$NOW" > "$CACHE"
  exit 0
fi
exit 1
