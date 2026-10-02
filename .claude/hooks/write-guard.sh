#!/usr/bin/env bash
# PreToolUse guard on the Write tool. Refuses a wholesale Write to src/App.js.
#
# Write REPLACES a file. App.js is 5,493 lines and holds nearly the whole app,
# so a Write to it is never the intended operation — it is a partial rewrite
# that silently drops everything the model did not re-emit. Edit changes the
# lines you name and leaves the rest untouched, which is what almost every
# App.js change actually wants.
#
# Same schema as pre-commit-guard.sh, and the same reason for it: PreToolUse
# uses hookSpecificOutput.permissionDecision, NOT the Stop event's
# {"decision":"block"}. Verified against the Claude Code 2.1.270 docs
# 2026-09-13.
#
# Fails CLOSED.

INPUT="$(cat)"
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

deny() {
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg r "$1" \
      '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  elif command -v python3 >/dev/null 2>&1; then
    R="$1" python3 -c 'import json,os;print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":os.environ["R"]}}))'
  else
    cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"The Write guard cannot run: neither jq nor python3 is on PATH. Tell Case the guard is non-functional on this machine."}}
JSON
  fi
  exit 0
}

if command -v jq >/dev/null 2>&1; then
  TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)"
  FP="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
elif command -v python3 >/dev/null 2>&1; then
  READ="$(printf '%s' "$INPUT" | python3 -c 'import sys,json
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
print(d.get("tool_name") or "")
print((d.get("tool_input") or {}).get("file_path") or "")' 2>/dev/null)"
  TOOL="$(printf '%s' "$READ" | sed -n 1p)"
  FP="$(printf '%s' "$READ" | sed -n 2p)"
else
  deny "unreachable: no JSON reader"
fi

[ "$TOOL" = "Write" ] || exit 0
[ -n "$FP" ] || exit 0

# Match on the path suffix so it catches both the absolute path and a
# repo-relative one, without being fooled by a similarly-named file elsewhere
# (e.g. bridge/src/App.js would not match src/App.js at a word boundary).
case "$FP" in
  */src/App.js|src/App.js)
    deny "BLOCKED: use Edit, not Write, on src/App.js. Write REPLACES the whole file, and App.js is 5,493 lines holding nearly the entire app — anything not re-emitted in the new content is silently deleted. Make the change with Edit (or several Edits), which touches only the lines you name. If you genuinely intend to replace all 5,493 lines, stop and ask Case to confirm first."
    ;;
esac

exit 0
