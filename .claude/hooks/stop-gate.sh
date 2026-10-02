#!/usr/bin/env bash
# Stop gate: refuses to let a session end on unverified code.
#
# Fast by design. It compares hashes, it does not run tests. Hooks run under a
# timeout and their stdout is swallowed, so running the suite here would surface
# a real failure as a timeout and Claude would never see what broke. Blocking
# with an instruction puts the test run in the transcript where it can be read
# and acted on.
#
# Fails CLOSED. If it cannot read its input or hash the tree, it blocks and says
# so. A gate that quietly disappears when a dependency is missing is worse than
# no gate, because you believe you still have one.

INPUT="$(cat)"
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p .session

# The block payload is a fixed string with no interpolation, so it needs no
# JSON escaper and works even when neither jq nor python3 is installed.
block() {
  cat <<'JSON'
{"decision":"block","reason":"Code changed this session and the current state has not passed verification. Run .claude/hooks/verify.sh now. If it exits non-zero, read the failure output, fix the cause, and run it again. Do not end this session until verify.sh exits 0. If you believe the change genuinely does not need verification, say so and ask Case to confirm rather than skipping silently."}
JSON
  exit 0
}

block_broken() {
  cat <<'JSON'
{"decision":"block","reason":"The stop gate could not run: neither jq nor python3 is on PATH, so it cannot read its own input. Tell Case the gate is non-functional on this machine and that nothing this session has been verified. Do not treat the work as complete."}
JSON
  exit 0
}

# --- Read the two fields we need --------------------------------------------
if command -v jq >/dev/null 2>&1; then
  ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)"
  SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null)"
elif command -v python3 >/dev/null 2>&1; then
  READ="$(printf '%s' "$INPUT" | python3 -c 'import sys,json
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
print(str(d.get("stop_hook_active", False)).lower())
print(d.get("session_id") or "nosession")' 2>/dev/null)"
  ACTIVE="$(printf '%s' "$READ" | sed -n 1p)"
  SESSION="$(printf '%s' "$READ" | sed -n 2p)"
else
  block_broken
fi

# --- Loop guard 1: the documented flag --------------------------------------
[ "$ACTIVE" = "true" ] && exit 0

# --- Loop guard 2: independent counter --------------------------------------
# anthropics/claude-code#54360: stop_hook_active can stay false across repeated
# fires when system reminders interleave, so guard 1 alone can deadlock.
case "$SESSION" in ""|null) SESSION=nosession ;; esac
COUNT_FILE=".session/stop-blocks-${SESSION}"
COUNT="$(cat "$COUNT_FILE" 2>/dev/null || echo 0)"
case "$COUNT" in ''|*[!0-9]*) COUNT=0 ;; esac
[ "$COUNT" -ge 2 ] && exit 0

# --- Has anything changed, and was it proven? -------------------------------
NOW="$("$HOOK_DIR/state-hash.sh" 2>/dev/null)"
if [ -z "$NOW" ] || [ "$NOW" = "no-hasher-available" ]; then
  echo $((COUNT + 1)) > "$COUNT_FILE"
  block_broken
fi

BASELINE="$(cat .session/baseline-hash 2>/dev/null)"
[ -n "$BASELINE" ] && [ "$NOW" = "$BASELINE" ] && exit 0   # nothing touched this session

VERIFIED="$(cat .session/verified-hash 2>/dev/null)"
[ "$NOW" = "$VERIFIED" ] && exit 0                         # this exact state passed

echo $((COUNT + 1)) > "$COUNT_FILE"
block
