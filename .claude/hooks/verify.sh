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

# 1. Build. CI=false because CRA promotes warnings to errors under CI=true,
#    which fails the build for lint noise rather than anything real.
echo "  [1/2] build"
if ! CI=false npm run build >/tmp/rl-build.log 2>&1; then
  echo "FAIL: build. Last 30 lines:"
  tail -30 /tmp/rl-build.log
  exit 1
fi

# 2. Tests. Visual assertions only run where a container can produce the
#    single -linux.png baseline set; everywhere else they are skipped and
#    recorded as pending, never silently dropped.
if [ "$RL_VISUAL" = "container" ]; then
  echo "  [2/2] full suite (functional + visual)"
  npm test || { echo "FAIL: test suite"; exit 1; }
  VISUAL=covered
else
  echo "  [2/2] functional only (visual unavailable: docker=${RL_DOCKER})"
  npm run test:functional || { echo "FAIL: functional tests"; exit 1; }
  VISUAL=pending
fi

# 3. Record what was proven, and on which machine.
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
