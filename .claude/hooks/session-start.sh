#!/usr/bin/env bash
# RoastLogs SessionStart briefing.
#
# Answers the three questions every session opens with: which machine am I on,
# where is the repo relative to origin, and what is actually live. Deliberately
# NOT a full repo read — App.js alone is ~5,500 lines across 154 tracked files,
# and spending the context window at boot is the problem the ledger exists to
# avoid. Targeted reads happen on demand after this.
#
# Emits the SessionStart envelope Claude Code expects:
#   {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}
# Any other shape is rejected, so every exit path below emits it.
#
# Set RL_NO_NET=1 to skip the fetch and the live-version probe (offline work).

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

# Session baseline, recorded before any work happens. Without it the stop gate
# cannot distinguish "nothing was touched this session" from "changes were made
# and never verified", so it would block on a session that was pure
# conversation. .session/ is gitignored — this state is per-machine and must
# never travel between the Mac and the HP.
mkdir -p .session
[ -x "$HOOK_DIR/state-hash.sh" ] && "$HOOK_DIR/state-hash.sh" > .session/baseline-hash 2>/dev/null

# Prune the stop gate's per-session block counters. stop-gate.sh writes
# .session/stop-blocks-<session_id> and never removes it, so without this the
# directory grows by one file for every session that gets blocked at least once
# — unbounded, forever. 7 days is well past any session's usable life: the
# counter only needs to survive repeated Stop fires within one session.
find .session -maxdepth 1 -name 'stop-blocks-*' -type f -mtime +7 -delete 2>/dev/null

emit() {
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg c "$1" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
  elif command -v python3 >/dev/null 2>&1; then
    CTX="$1" python3 -c 'import json,os;print(json.dumps({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":os.environ["CTX"]}}))'
  else
    echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"RoastLogs briefing needs jq or python3 on PATH. Install jq, then restart the session."}}'
  fi
  exit 0
}

OUT="=== RoastLogs session briefing ==="$'\n'

# --- 1. Machine profile -----------------------------------------------------
# shellcheck source=/dev/null
. "$HOOK_DIR/machine-profile.sh" 2>/dev/null
OUT="${OUT}${RL_PROFILE_LINE:-machine=unknown}"$'\n'

if [ "$RL_CAN_DEPLOY" != "yes" ]; then
  OUT="${OUT}  Deploy is DISABLED on this machine (needs the gitignored .env). Do not run npm run deploy."$'\n'
fi
if [ "$RL_VISUAL" != "container" ]; then
  OUT="${OUT}  Visual regression UNAVAILABLE (docker: ${RL_DOCKER}). Functional + DOM tests only."$'\n'
  OUT="${OUT}  Any UI change this session must be logged as 'visual verification pending' and cannot merge until cleared."$'\n'
fi

# --- 2. Repo position -------------------------------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
OUT="${OUT}"$'\n'"branch: ${BRANCH}"$'\n'

if [ "$RL_NO_NET" != "1" ]; then
  git fetch --quiet 2>/dev/null
  UP="$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null)"
  if [ -n "$UP" ]; then
    AHEAD="$(git rev-list --count "$UP"..HEAD 2>/dev/null)"
    BEHIND="$(git rev-list --count HEAD.."$UP" 2>/dev/null)"
    if [ "${BEHIND:-0}" -gt 0 ]; then
      OUT="${OUT}  STOP: ${BEHIND} commit(s) behind ${UP}. Pull before doing anything."$'\n'
      OUT="${OUT}  This is the 2026-09-07 failure mode — a stale clone deployed over newer work."$'\n'
    fi
    [ "${AHEAD:-0}" -gt 0 ] && OUT="${OUT}  ${AHEAD} commit(s) ahead of ${UP} (unpushed)."$'\n'
    [ "${BEHIND:-0}" -eq 0 ] && [ "${AHEAD:-0}" -eq 0 ] && OUT="${OUT}  in sync with ${UP}"$'\n'
  fi
fi

DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
[ "${DIRTY:-0}" -gt 0 ] && OUT="${OUT}  ${DIRTY} uncommitted change(s) in the working tree."$'\n'

# --- 3. Local vs live version ----------------------------------------------
LOCAL_V="$(node -p "require('./package.json').version" 2>/dev/null)"
HOMEPAGE="$(node -p "require('./package.json').homepage" 2>/dev/null)"
OUT="${OUT}"$'\n'"version local: ${LOCAL_V:-unknown}"$'\n'

if [ "$RL_NO_NET" != "1" ] && [ -n "$HOMEPAGE" ]; then
  # Same detection the @smoke test uses: find the main bundle, read appVersion
  # out of it. HTTP 200 on the HTML proves nothing about which build is served.
  HTML="$(curl -fsSL --max-time 10 "${HOMEPAGE}/" 2>/dev/null)"
  BUNDLE_PATH="$(printf '%s' "$HTML" | grep -oE '[^"]*static/js/main\.[A-Za-z0-9]+\.js' | head -1)"
  if [ -n "$BUNDLE_PATH" ]; then
    ORIGIN="$(printf '%s' "$HOMEPAGE" | sed -E 's#^(https?://[^/]+).*#\1#')"
    case "$BUNDLE_PATH" in
      http*) BUNDLE_URL="$BUNDLE_PATH" ;;
      /*)    BUNDLE_URL="${ORIGIN}${BUNDLE_PATH}" ;;
      *)     BUNDLE_URL="${HOMEPAGE}/${BUNDLE_PATH}" ;;
    esac
    LIVE_V="$(curl -fsSL --max-time 20 "$BUNDLE_URL" 2>/dev/null | grep -oE 'appVersion:"[0-9]+\.[0-9]+\.[0-9]+"' | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
    OUT="${OUT}version live:  ${LIVE_V:-unreadable}"$'\n'
    if [ -n "$LIVE_V" ] && [ "$LIVE_V" != "$LOCAL_V" ]; then
      OUT="${OUT}  Local and live differ — there is undeployed work, or the last deploy did not land."$'\n'
    fi
  else
    OUT="${OUT}version live:  could not locate main bundle"$'\n'
  fi
fi

# --- 4. Open actions --------------------------------------------------------
if [ -f docs/NEXT-SESSION.md ]; then
  # Open actions live in the "| # | What | Blocked on |" TABLE, not in the
  # numbered prose. This originally grepped numbered items out of "Pick up
  # here" -- but that section has always been a summary of what the LAST
  # session SHIPPED (true of both the 2026-09-10 and 2026-09-12 revisions), so
  # it reported completed work as the open list: the precise inversion this
  # block set out to avoid. Verified against the real file 2026-09-13.
  #
  # Field 2 is the row number, field 3 the description. Bold/backtick markup is
  # stripped and the cell truncated, because a single row can run 800+ chars.
  ITEMS="$(awk -F'|' '/^\| *[0-9]+ *\|/ {
             n=$2; d=$3;
             gsub(/^[ \t]+|[ \t]+$/, "", n);
             gsub(/^[ \t]+|[ \t]+$/, "", d);
             gsub(/\*\*|`/, "", d);
             printf "  %s. %s\n", n, substr(d, 1, 150);
           }' docs/NEXT-SESSION.md | head -10)"
  if [ -n "$ITEMS" ]; then
    OUT="${OUT}"$'\n'"open actions (docs/NEXT-SESSION.md → open-items table):"$'\n'"${ITEMS}"$'\n'
  fi
fi

# --- 5. Staleness -----------------------------------------------------------
if [ -x "$HOOK_DIR/staleness-check.sh" ]; then
  S="$("$HOOK_DIR/staleness-check.sh" 2>/dev/null)"
  [ -n "$S" ] && OUT="${OUT}"$'\n'"agent/skill currency:"$'\n'"${S}"$'\n'
fi

OUT="${OUT}"$'\n'"Briefing only. Do not start work until Case states the goal for this session."$'\n'

emit "$OUT"
