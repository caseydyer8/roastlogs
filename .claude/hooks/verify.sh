#!/usr/bin/env bash
# The gate. Run as a normal command, never from inside a hook — it needs to be
# slow and it needs its output read.
#
# Exits 0 only if everything it checked passed, and records exactly what state
# was proven so stop-gate.sh can tell whether that proof still applies.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 1
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p .session

# shellcheck source=/dev/null
. "$HOOK_DIR/machine-profile.sh" 2>/dev/null

echo "verify: ${RL_PROFILE_LINE:-machine=unknown}"

# 1. Ledger. FIRST, and before the build, because it is the cheapest check and
#    because an item marked done with no acceptance criterion means the record
#    of what was proven is already wrong. A failing ledger stops the gate as
#    surely as a failing test: completeness has to be data, not prose.
echo "  [1/6] ledger"
if [ -f .claude/tools/ledger.js ] && [ ! -d docs/private ]; then
  # Fail, do not skip: a gate that quietly passes without its ledger is not a
  # gate. The ledger moved to the private repo on 2026-09-23.
  echo "FAIL: docs/private/ is missing, so the ledger cannot be validated."
  echo "      From the repo root: git clone git@github.com:caseydyer8/roastlogs-ops.git docs/private"
  exit 1
elif [ -f .claude/tools/ledger.js ]; then
  if ! node .claude/tools/ledger.js validate; then
    echo "FAIL: ledger validation. Fix docs/private/ledger.json, then re-run."
    exit 1
  fi
  # The NEXT-SESSION.md table is generated output. If it has drifted from the
  # ledger someone hand-edited it, and the briefing every session reads from
  # would be describing state that no longer exists.
  if ! node .claude/tools/ledger.js render --check; then
    echo "FAIL: NEXT-SESSION.md table has drifted from the ledger."
    echo "      Run: node .claude/tools/ledger.js render"
    exit 1
  fi
else
  echo "    (no ledger tool present, skipping)"
fi

# 2. Secrets. Before the build, and before anything slow: a leaked credential
#    makes the rest of the gate irrelevant. This is the compensating control
#    for pre-commit-guard.sh no longer blanket-blocking git add — that guard
#    watches filenames, this watches CONTENT, so a secret pasted into a
#    source file or a fixture is caught too.
echo "  [2/6] secret scan"
if [ -x "$HOOK_DIR/secret-scan.sh" ]; then
  if ! "$HOOK_DIR/secret-scan.sh"; then
    echo "FAIL: secret scan. A ledger item was opened at critical severity."
    echo "      Do not commit. Remove or ignore the value, and rotate it if it was ever real."
    exit 1
  fi
else
  echo "    (no secret-scan.sh present, skipping)"
fi

# 3. Push gate. The publication gate (the text guard plus the git-native pre-push
#    hook) is the only thing between a commit and a permanently public repo, and a
#    later edit to either can reopen a gap without anyone noticing, so its end-to-end
#    probes run on verify. They need no network: every fixture is a throwaway repo with
#    a local bare remote. FAIL fails verify; a SKIP (the Linux-simulated Windows
#    probes under Git Bash) does not. A missing
#    harness fails too: a gate that quietly passes without its checks is not a gate.
#    The probes take a couple of minutes, so .claude/tools/verify-push-gate.sh skips
#    them when the four gate files, the harness and git itself are unchanged since the
#    last PASS (it prints a note when it does), and it runs BEFORE the build so a gate
#    failure does not throw away a finished build and browser run. The DOC probes lint
#    the WORDING of CLAUDE.md and the skills, so they are excluded there: rewording a
#    sentence must not fail the commit gate. A standalone run still runs them.
echo "  [3/6] push gate"
if [ ! -f .claude/tools/verify-push-gate.sh ]; then
  echo "FAIL: .claude/tools/verify-push-gate.sh is missing, so the push gate cannot be checked."
  exit 1
fi
if ! bash .claude/tools/verify-push-gate.sh; then
  echo "FAIL: push gate. A publication-gate probe failed or could not run (see the FAIL lines above)."
  echo "      Re-run with detail: bash .claude/tools/test-push-gate.sh"
  exit 1
fi

# 4. Build. CI=false because CRA promotes warnings to errors under CI=true,
#    which fails the build for lint noise rather than anything real.
echo "  [4/6] build"
if ! CI=false npm run build >/tmp/rl-build.log 2>&1; then
  echo "FAIL: build. Last 30 lines:"
  tail -30 /tmp/rl-build.log
  exit 1
fi

# 5. Unit tests. A couple of seconds, and they cover the pure logic in src/lib
#    and the live-chart model, so they run before the slow browser suite and
#    fail fast. CI=true makes react-scripts exit instead of watching.
echo "  [5/6] unit tests"
if ! CI=true npm run test:unit >/tmp/rl-unit.log 2>&1; then
  echo "FAIL: unit tests. Last 40 lines:"
  tail -40 /tmp/rl-unit.log
  exit 1
fi
grep -E "^(Test Suites|Tests):" /tmp/rl-unit.log | sed 's/^/    /'

# 6. Browser tests. Visual assertions only run where a container can produce the
#    single -linux.png baseline set; everywhere else they are skipped and
#    recorded as pending, never silently dropped.
if [ "$RL_VISUAL" = "container" ]; then
  echo "  [6/6] full suite (functional + visual)"
  npm test || { echo "FAIL: test suite"; exit 1; }
  VISUAL=covered
else
  echo "  [6/6] functional only (visual unavailable: docker=${RL_DOCKER})"
  npm run test:functional || { echo "FAIL: functional tests"; exit 1; }
  VISUAL=pending
fi

# 7. Record what was proven, and on which machine.
"$HOOK_DIR/state-hash.sh" > .session/verified-hash
{
  echo "verified_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "machine=${RL_MACHINE:-unknown}"
  echo "visual=${VISUAL}"
} > .session/verified-meta

echo "verify: PASS  (visual: ${VISUAL})"
[ "$VISUAL" = "pending" ] && \
  echo "  NOTE: visual coverage not proven on this machine. Log the item as 'visual verification pending' before merging."
exit 0
