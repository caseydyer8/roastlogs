#!/usr/bin/env bash
# PreToolUse guard on the Bash tool. Refuses three specific commands.
#
# SCHEMA NOTE — this is NOT the shape stop-gate.sh uses, and the difference is
# real rather than stylistic. Verified against the Claude Code 2.1.270 hooks
# documentation on 2026-09-13:
#
#   Stop        -> {"decision":"block","reason":"..."}
#   PreToolUse  -> {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#                    "permissionDecision":"deny",
#                    "permissionDecisionReason":"..."}}
#
# permissionDecision takes "allow" | "deny" | "ask". The reason key is
# permissionDecisionReason — capital R, and a different name from the Stop
# event's plain "reason". A top-level "decision" field is not documented for
# PreToolUse at all, so emitting the Stop shape here would parse as no decision
# and the command would sail through. That is why this file does not share a
# helper with stop-gate.sh.
#
# SCOPE — this only ever sees explicit Bash TOOL CALLS. PreToolUse fires on
# tool invocations and matches on tool_name, so Claude Code's own internal git
# work and git run from inside other hooks do not pass through here. It cannot
# gate those, and it does not try to.
#
# Fails CLOSED, same as stop-gate.sh: if it cannot read its input or hash the
# tree, it denies and says why. A guard that vanishes when a dependency is
# missing is worse than no guard, because you still believe you have one.

INPUT="$(cat)"
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

# Emit a deny. The reason arrives as $1; it is JSON-escaped rather than
# interpolated raw, because a reason containing a quote or newline would
# otherwise produce malformed JSON and the deny would be silently lost.
deny() {
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg r "$1" \
      '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  elif command -v python3 >/dev/null 2>&1; then
    R="$1" python3 -c 'import json,os;print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":os.environ["R"]}}))'
  else
    # No escaper available. Still deny — with a fixed, literal payload that
    # needs no escaping — rather than letting the command through.
    cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"The pre-commit guard cannot run: neither jq nor python3 is on PATH, so it cannot read its own input. Tell Case the guard is non-functional on this machine. Do not work around it."}}
JSON
  fi
  exit 0
}

# --- Read the command out of tool_input -------------------------------------
if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)"
  TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)"
elif command -v python3 >/dev/null 2>&1; then
  READ="$(printf '%s' "$INPUT" | python3 -c 'import sys,json
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
print(d.get("tool_name") or "")
print((d.get("tool_input") or {}).get("command") or "")' 2>/dev/null)"
  TOOL="$(printf '%s' "$READ" | sed -n 1p)"
  CMD="$(printf '%s' "$READ" | sed -n '2,$p')"
else
  deny "unreachable: no JSON reader"
fi

# Only Bash is in scope. Anything else is allowed through untouched — silence
# plus exit 0 is "no opinion", which is the correct default for a guard.
[ "$TOOL" = "Bash" ] || exit 0
[ -n "$CMD" ] || exit 0

# --- 1. git merge of the forbidden branch -----------------------------------
# Checked FIRST: it is unconditional, and it must not be reachable by first
# satisfying some other condition.
case "$CMD" in
  *git*merge*feature/v1.1-history-chart*)
    deny "BLOCKED: feature/v1.1-history-chart must never be merged. It is a retired branch kept for reference only. If you believe this specific merge is correct, stop and ask Case — do not rephrase the command to get around this guard."
    ;;
esac

# --- 2. git add of secrets ---------------------------------------------------
case "$CMD" in
  *git*add*)
    # .env is refused outright. It holds the Supabase config a build bakes
    # into the published bundle; it is gitignored, and naming it explicitly is
    # the only way it reaches a commit.
    case "$CMD" in
      *.env*)
        deny "BLOCKED: refusing to stage .env. It holds the Supabase config that a build bakes into the published bundle, and it is gitignored by design. If you need to change what the app ships with, edit .env.example instead."
        ;;
    esac

    # findings/ is refused only when it ACTUALLY contains credentials, which is
    # the condition worth gating — a finding with no secret in it is ordinary
    # reviewable text. Checked whenever the command names findings/ OR is a
    # broad add that would sweep it without naming it (-A, -u, ., :/).
    SWEEPS=no
    case "$CMD" in
      *findings/*) SWEEPS=yes ;;
      *"git add -A"*|*"git add --all"*|*"git add -u"*|*"git add ."*|*"git add :/"*) SWEEPS=yes ;;
    esac
    if [ "$SWEEPS" = yes ] && [ -d findings ]; then
      if ! command -v grep >/dev/null 2>&1; then
        deny "BLOCKED: cannot scan findings/ for credentials because grep is unavailable, so it is not possible to tell whether this add would commit a secret. Stage specific files by name instead."
      fi
      # Patterns that mean a real credential rather than a mention of one:
      # a Supabase secret key, a service_role token, a JWT header, a private
      # key block, or an assigned password/secret value.
      HIT="$(grep -rlaE 'sb_secret_[A-Za-z0-9_-]|eyJhbGciOi|BEGIN [A-Z ]*PRIVATE KEY|"(password|secret|service_role_key)"[[:space:]]*:[[:space:]]*"[^"]+"' findings 2>/dev/null | head -3)"
      if [ -n "$HIT" ]; then
        deny "BLOCKED: this would stage credential material under findings/. Matches in: $(printf '%s' "$HIT" | tr '\n' ' '). Findings are agent output awaiting human promotion into docs/ledger.json — the ledger is the durable record and it travels; the raw finding does not need to. Strip the credential from the file, or stage only the specific files you mean by name."
      fi
    fi
    ;;
esac

# --- 3. git commit on unverified state --------------------------------------
case "$CMD" in
  *git*commit*)
    NOW="$("$HOOK_DIR/state-hash.sh" 2>/dev/null)"
    if [ -z "$NOW" ] || [ "$NOW" = "no-hasher-available" ]; then
      deny "BLOCKED: the pre-commit guard could not hash the working tree, so it cannot tell whether this state was verified. Nothing has been proven. Tell Case the guard is non-functional rather than committing."
    fi
    VERIFIED="$(cat .session/verified-hash 2>/dev/null)"
    if [ "$NOW" != "$VERIFIED" ]; then
      deny "BLOCKED: this state has not passed verification, so there is nothing to commit against. Run .claude/hooks/verify.sh first — it takes about 45 seconds (ledger, build, tests). If it exits non-zero, read the failure, fix the cause, and run it again. Only commit once it exits 0. Note that committing changes HEAD and therefore invalidates this proof, so the Stop gate will ask for one more verify.sh afterwards; that is expected, not a loop."
    fi
    ;;
esac

exit 0
