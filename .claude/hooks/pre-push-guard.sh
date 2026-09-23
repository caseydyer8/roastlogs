#!/usr/bin/env bash
# PreToolUse publication gate. Denies a push unless publication-reviewer has
# cleared the EXACT commit range being pushed.
#
# WHY A MARKER FILE AND NOT AN AGENT HOOK. Claude Code 2.1.270 does support
# `type: "agent"` hooks, but the docs mark them "experimental and may change"
# and do NOT specify their output contract — there is no documented
# {"ok": true/false}, and no documented way to turn a subagent verdict into a
# permission decision. A publication gate is exactly the wrong place to build
# on an undocumented contract: if the shape is wrong the hook returns no
# decision and the push proceeds, which fails OPEN. So the verdict is carried
# by a file this script can verify itself.
#
# SCHEMA: PreToolUse uses hookSpecificOutput.permissionDecision
# (allow|deny|ask) with permissionDecisionReason. NOT the Stop event's
# {"decision":"block","reason":...}. Verified against the 2.1.270 docs.
#
# TWO PUBLICATION PATHS, both gated:
#   1. Bash `git push`
#   2. The GitHub MCP write tools (push_files, create_or_update_file,
#      delete_file). These do NOT go through Bash, so a Bash-only matcher
#      never sees them — they would have been a silent hole straight past
#      this gate. They write arbitrary content through the API with no local
#      commit range, so clearance cannot describe them and they are denied
#      outright with a pointer back to git push.
#
# ONE EXEMPTION: a push whose resolved remote URL is the PRIVATE
# caseydyer8/roastlogs-ops repo (cloned at docs/private/). Nothing there becomes
# public, so there is nothing to clear. Tested both ways on 2026-09-23: ops
# pushes (via -C, cwd, and cd) allowed without clearance; a main-repo push, a
# mixed ops+main command, and a look-alike URL all still denied.
#
# Fails CLOSED.

INPUT="$(cat)"
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
CLEARANCE=".session/publish-clearance"

emit_deny() {
  R="$1" python3 -c 'import json,os;print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":os.environ["R"]}}))' 2>/dev/null && exit 0
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"The publication gate could not emit its decision. Nothing has been cleared for publication. Tell Case the gate is non-functional on this machine."}}
JSON
  exit 0
}

if ! command -v python3 >/dev/null 2>&1; then
  emit_deny "The publication gate requires python3 and it is not on PATH. Denying rather than guessing whether this push was reviewed. Tell Case the gate is non-functional on this machine."
fi

# shellcheck disable=SC2016
# Single quotes deliberate: this is Python, the shell must not expand it.
#
# Emits one line per `git push` found: "GIT_PUSH<TAB><repo dir><TAB><remote>".
# The repo dir is resolved from the hook's cwd, any `cd DIR` earlier in the
# same command, and `git -C DIR`; the remote is the first non-flag argument
# after push (empty = git's default). Every push in the command is reported,
# so `git -C docs/private push && git push` cannot hide the second one.
CLASS="$(printf '%s' "$INPUT" | python3 -c '
import json, os, re, shlex, sys

try:
    d = json.load(sys.stdin)
except Exception:
    print("PARSE_ERROR")
    sys.exit(0)

tool = d.get("tool_name") or ""

# GitHub MCP tools that WRITE content to the remote. These bypass Bash.
if tool.startswith("mcp__github__"):
    leaf = tool.split("__")[-1]
    if leaf in ("push_files", "create_or_update_file", "delete_file"):
        print("MCP_WRITE:" + leaf)
    sys.exit(0)

if tool != "Bash":
    sys.exit(0)

cmd = (d.get("tool_input") or {}).get("command") or ""
if not cmd.strip():
    sys.exit(0)

cwd = d.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

def resolve(base, p):
    p = os.path.expanduser(p)
    return os.path.normpath(p if os.path.isabs(p) else os.path.join(base, p))

ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
for seg in re.split(r"(?:\|\||&&|;|\||\n)", cmd):
    seg = seg.strip()
    if not seg:
        continue
    try:
        toks = shlex.split(seg)
    except ValueError:
        # A heredoc apostrophe is not a push. Only escalate if the segment
        # actually mentions push.
        if not re.search(r"\bpush\b", seg):
            continue
        toks = seg.split()
    while toks and ASSIGN.match(toks[0]):
        toks.pop(0)
    if not toks:
        continue
    if toks[0] in ("cd", "pushd") and len(toks) > 1:
        cwd = resolve(cwd, toks[1])
        continue
    if toks[0].rsplit("/", 1)[-1] != "git":
        continue
    rest = toks[1:]
    repo = cwd
    i = 0
    while i < len(rest):
        t = rest[i]
        if t == "-C" and i + 1 < len(rest):
            repo = resolve(repo, rest[i + 1])
            i += 2
            continue
        if t in ("--git-dir", "--work-tree", "-c"):
            i += 2
            continue
        if t.startswith("-"):
            i += 1
            continue
        if t == "push":
            remote = ""
            for a in rest[i + 1:]:
                if not a.startswith("-"):
                    remote = a
                    break
            print("GIT_PUSH\t" + repo + "\t" + remote)
        break
' 2>/dev/null)"

case "$CLASS" in
  PARSE_ERROR*)
    emit_deny "The publication gate could not read its own hook input, so it cannot tell whether this is a push. Denying. Tell Case the gate is non-functional."
    ;;
  MCP_WRITE:*)
    emit_deny "BLOCKED: ${CLASS#MCP_WRITE:} writes content straight to the public GitHub repo through the API, bypassing the local commit range that the publication gate reviews. There is no way to clear it, because there is no range to review. Use a local commit plus 'git push' instead, so /publish-review can see exactly what becomes public."
    ;;
  GIT_PUSH*) ;;   # fall through
  *) exit 0 ;;
esac

# --- Exempt pushes to the PRIVATE ops repo, and only those -------------------
# docs/private/ is a clone of caseydyer8/roastlogs-ops. Nothing pushed there
# becomes public, so publication clearance does not apply. The exemption is
# decided by the RESOLVED remote URL, never by the directory name: a push from
# docs/private/ whose remote points anywhere else is still gated. If any push
# in the command is not to roastlogs-ops, the whole command is gated.
# Anchored at both ends so a look-alike host (https://evil.example/github.com/
# caseydyer8/roastlogs-ops) cannot borrow the exemption.
OPS_URL_RE='^(https://([^@/]+@)?github\.com/|git@github\.com:|ssh://git@github\.com/)caseydyer8/roastlogs-ops(\.git)?/?$'
GATED=0
while IFS="$(printf '\t')" read -r KIND PDIR PREMOTE; do
  [ "$KIND" = "GIT_PUSH" ] || continue
  if [ -z "$PREMOTE" ]; then
    PB="$(git -C "$PDIR" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    PREMOTE="$(git -C "$PDIR" config "branch.${PB}.pushRemote" 2>/dev/null)"
    [ -n "$PREMOTE" ] || PREMOTE="$(git -C "$PDIR" config remote.pushDefault 2>/dev/null)"
    [ -n "$PREMOTE" ] || PREMOTE="$(git -C "$PDIR" config "branch.${PB}.remote" 2>/dev/null)"
    [ -n "$PREMOTE" ] || PREMOTE="origin"
  fi
  if printf '%s' "$PREMOTE" | grep -qE '://|@'; then
    PURL="$PREMOTE"
  else
    PURL="$(git -C "$PDIR" remote get-url --push "$PREMOTE" 2>/dev/null)"
  fi
  if printf '%s' "$PURL" | grep -qE "$OPS_URL_RE"; then
    continue
  fi
  GATED=1
done <<EOF
$CLASS
EOF
[ "$GATED" = "1" ] || exit 0

# --- Resolve the range this push would publish -------------------------------
BR="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
HEAD_SHA="$(git rev-parse HEAD 2>/dev/null)"
if [ -z "$HEAD_SHA" ]; then
  emit_deny "BLOCKED: the publication gate could not resolve HEAD, so it cannot identify what would be published. Denying."
fi

if git rev-parse --verify "origin/$BR" >/dev/null 2>&1; then
  BASE_SHA="$(git rev-parse "origin/$BR" 2>/dev/null)"
else
  BASE_SHA="$(git merge-base origin/main HEAD 2>/dev/null)"
fi
[ -n "$BASE_SHA" ] || BASE_SHA="root"

RANGE="${BASE_SHA}..${HEAD_SHA}"

# --- Require clearance for THIS exact range ---------------------------------
# Exact-match on both SHAs is the point: a new commit moves HEAD, so yesterday's
# clearance cannot launder today's content.
if [ ! -f "$CLEARANCE" ]; then
  emit_deny "BLOCKED: nothing has been cleared for publication. This repo is PUBLIC and a push is irreversible — forks, clones and caches keep the content reachable even after a force-push. Run /publish-review to have publication-reviewer examine the outbound diff, every commit message in the range, and any newly tracked files. It writes clearance only on a 'clear' verdict. Range needing review: ${RANGE}"
fi

CLEARED="$(tr -d ' \t\n\r' < "$CLEARANCE" 2>/dev/null)"
if [ "$CLEARED" != "$RANGE" ]; then
  emit_deny "BLOCKED: the publication clearance on file does not match what this push would publish. Cleared: '${CLEARED:-none}'. This push: '${RANGE}'. A clearance covers one exact range, so any new commit voids it by design. Re-run /publish-review for the current range."
fi

exit 0
