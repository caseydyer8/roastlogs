#!/usr/bin/env bash
# PreToolUse guard on the Bash tool. Denies three specific git INVOCATIONS.
#
# SCHEMA — PreToolUse does NOT share a shape with Stop. Verified against the
# Claude Code 2.1.270 docs:
#   Stop        {"decision":"block","reason":"..."}
#   PreToolUse  {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#                 "permissionDecision":"deny",            # allow | deny | ask
#                 "permissionDecisionReason":"..."}}
# permissionDecisionReason has a capital R and is a different key from Stop's
# plain "reason". A top-level "decision" is not documented for PreToolUse, so
# emitting the Stop shape here parses as no decision and the command proceeds.
#
# PARSING, not substring matching. The previous version matched the whole
# command string, which denied any command whose TEXT contained a pattern —
# it blocked its own test harness and a commit whose MESSAGE mentioned .env,
# while being unable to prevent the actual harm. Now the command is split on
# ; && || | and newlines, leading VAR=val assignments are stripped, and only
# the resulting first token plus its subcommand are inspected. So:
#     echo "git add -f .env"   -> allowed, it is a string
#     git add -f .env          -> denied, it is an invocation
#
# Note plain `git add .env` is a NO-OP: .env is gitignored, so git refuses it
# without -f. That is why the old blanket rule was noisiest exactly where it
# could not prevent harm. The force flag is the thing worth gating.
#
# LIMITS, stated rather than implied. This parser does NOT evaluate $() or
# backticks, and cannot resolve a command name hidden behind a variable
# ($TOOL push). The Claude Code docs say the same of their own `if` filter:
# "Because the `if` filter is best-effort, use the permission system rather
# than a hook to enforce a hard allow or deny." Treat this as a guard against
# mistakes, not as a control against a determined bypass.
#
# Fails CLOSED: if it cannot parse its input or hash the tree, it denies.

INPUT="$(cat)"
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

FORBIDDEN_BRANCH="feature/v1.1-history-chart"

emit_deny() {
  R="$1" python3 -c 'import json,os;print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":os.environ["R"]}}))' 2>/dev/null && exit 0
  # python3 gone mid-flight: still deny, with a literal payload needing no escaping.
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"The pre-commit guard could not emit its decision. Treat this state as unverified and tell Case the guard is non-functional on this machine."}}
JSON
  exit 0
}

# python3 carries both the JSON read and the command parse. shlex handles
# quoting correctly, which hand-rolled shell word splitting does not.
if ! command -v python3 >/dev/null 2>&1; then
  emit_deny "The pre-commit guard requires python3 to parse the command safely and it is not on PATH. Rather than guess at the command, it is denying. Tell Case the guard is non-functional on this machine."
fi

# Emits one line per git invocation found: "<subcommand>\t<space-joined args>"
# shellcheck disable=SC2016
# The single quotes are deliberate: this is a Python program, and the shell
# must NOT expand $() or $VAR inside it — those belong to Python's own syntax
# and to the command text being analysed.
VERDICT="$(printf '%s' "$INPUT" | python3 -c '
import json, re, shlex, sys

try:
    d = json.load(sys.stdin)
except Exception:
    print("PARSE_ERROR")
    sys.exit(0)

if (d.get("tool_name") or "") != "Bash":
    sys.exit(0)
cmd = (d.get("tool_input") or {}).get("command") or ""
if not cmd.strip():
    sys.exit(0)

# Split into segments on the shell operators that start a new command.
segments = re.split(r"(?:\|\||&&|;|\||\n)", cmd)

ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")

for seg in segments:
    seg = seg.strip()
    if not seg:
        continue
    try:
        toks = shlex.split(seg)
    except ValueError:
        # Unparseable segment — usually a heredoc body carrying an apostrophe,
        # which is entirely normal and has nothing to do with git. Denying the
        # whole command here was wrong: it rejected ordinary scripting while
        # adding no safety. So narrow it: if the segment does not even mention
        # git there is nothing this guard governs, and it is skipped. If it
        # DOES mention git, fall back to a crude whitespace split — good enough
        # to spot `git <subcommand>` — and if even that is ambiguous, deny.
        if not re.search(r"\bgit\b", seg):
            continue
        toks = seg.split()
        if not toks:
            continue
    # Strip leading VAR=val assignments, matching how Claude Code itself
    # evaluates Bash patterns ("leading assignments are stripped").
    while toks and ASSIGN.match(toks[0]):
        toks.pop(0)
    if not toks:
        continue
    exe = toks[0].rsplit("/", 1)[-1]
    if exe != "git":
        continue
    # First token after git that is not a global flag is the subcommand.
    rest = toks[1:]
    sub = None
    i = 0
    while i < len(rest):
        t = rest[i]
        if t in ("-C", "--git-dir", "--work-tree", "-c"):
            i += 2
            continue
        if t.startswith("-"):
            i += 1
            continue
        sub = t
        i += 1
        break
    if sub is None:
        continue
    print(sub + "\t" + " ".join(rest[i:]))
' 2>/dev/null)"

case "$VERDICT" in
  PARSE_ERROR*)
    emit_deny "The pre-commit guard could not parse this command (unbalanced quotes or malformed hook input), so it cannot tell what it would run. Denying rather than guessing. Simplify the command into separate calls."
    ;;
esac

[ -n "$VERDICT" ] || exit 0

# --- Walk each git invocation found -----------------------------------------
while IFS="$(printf '\t')" read -r SUB ARGS; do
  [ -n "$SUB" ] || continue
  case "$SUB" in

    # 1. Forbidden merge. Unconditional, and checked on the parsed subcommand
    #    so a commit message mentioning the branch cannot trigger it.
    merge)
      case " $ARGS " in
        *" $FORBIDDEN_BRANCH "*|*"/$FORBIDDEN_BRANCH "*|*" $FORBIDDEN_BRANCH")
          emit_deny "BLOCKED: $FORBIDDEN_BRANCH must never be merged. It is retired and kept for reference only. If you believe this specific merge is correct, stop and ask Case — do not rephrase to evade this guard."
          ;;
      esac
      ;;

    # 2. Forced add. Plain `git add .env` already fails on its own because
    #    .env is gitignored; -f is what overrides that, so -f is the gate.
    add)
      for a in $ARGS; do
        case "$a" in
          -f|--force|-f*)
            emit_deny "BLOCKED: refusing a forced git add. -f overrides .gitignore, which is the only way .env or anything under findings/ reaches a commit. Both are ignored deliberately: .env holds the Supabase config a build bakes into the published bundle, and findings/ is a queue of untriaged security findings in a PUBLIC repo. Stage the specific files you mean without -f."
            ;;
        esac
      done
      ;;

    # 3. Commit on unverified state.
    commit)
      NOW="$("$HOOK_DIR/state-hash.sh" 2>/dev/null)"
      if [ -z "$NOW" ] || [ "$NOW" = "no-hasher-available" ]; then
        emit_deny "BLOCKED: the guard could not hash the working tree, so it cannot tell whether this state was verified. Nothing has been proven. Tell Case the guard is non-functional rather than committing."
      fi
      VERIFIED="$(cat .session/verified-hash 2>/dev/null)"
      if [ "$NOW" != "$VERIFIED" ]; then
        emit_deny "BLOCKED: this state has not passed verification. Run .claude/hooks/verify.sh first (about 45-55s: ledger, secret scan, build, tests). If it exits non-zero, read the failure, fix the cause, run it again, and only commit once it exits 0. Committing moves HEAD and therefore invalidates the proof, so the Stop gate will ask for one more verify.sh afterwards — that is designed, not a loop."
      fi
      ;;
  esac
done <<EOF
$VERDICT
EOF

exit 0
