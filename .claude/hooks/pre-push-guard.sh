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
# TWO LAYERS. This script reads the TEXT of Claude's command and guesses what git
# will do, which can be wrong. The authority is the git-native hook, .githooks/pre-push: git itself runs
# it at push time and hands it the real refs, repo and URL, but ONLY in a repo whose
# config names it (core.hooksPath), i.e. a clone the installer has run in. So this
# script adds these duties (all additive; no deny path above was loosened):
#   1. refuse the common spellings of switching that hook off or going around it
#      (core.hooksPath, editing or removing the core config section, the hook-skip
#      flag, GIT_CONFIG_*, send-pack), of a push that points git at ANOTHER repo or
#      re-points a remote (GIT_DIR, --git-dir, --work-tree, git -c, --repo), and of a
#      push that is wrapped or hidden so this script cannot read it (bash -c, eval,
#      xargs, env, nice, a subshell, a shell keyword in front, a single &...). The
#      hook-skip flag is refused in any command, not only one that names push;
#   2. refuse the common spellings of Claude running the installer. It decides which
#      hook is the gate, so that is Case's job;
#   3. refuse a recognised push unless the hook is actually installed, since a
#      missing hook is a silent fail-open. The installer COPIES the hook into the
#      git dir and sets an absolute core.hooksPath to that directory, so a branch
#      with no .githooks/ cannot remove it. A missing, unmarked or non-executable
#      copy is a deny, and so is a copy that is not byte-identical to a COMMITTED
#      .githooks/pre-push (HEAD, origin/main or local main; carriage returns are
#      ignored on the committed side only). A copy that matches origin/main or main
#      but not a newer hook committed on this branch is allowed with a note;
#   4. refuse a push that DELETES a remote branch or tag (--delete, -d, a :ref
#      refspec). The git hook lets Case delete from his own terminal (a delete
#      publishes nothing, so there is no range to clear); Claude may not;
#   5. refuse write-ish commands that name the gate files, the git config or
#      refs/remotes (redirects, tee, sed -i, cp, mv, rm, ln, git config writes,
#      git update-ref, git symbolic-ref with a value). Reads stay allowed;
#   6. treat a crash while reading the command as unreadable, never as "allow".
# WHAT THIS DOES NOT CLOSE. A speed bump, not a wall: it stops accidents and the common
# spellings. Only a server-side rule on GitHub (a ruleset on main that requires a pull
# request and restricts direct pushes) is a wall. Known limits are in the private ops
# notes. See the Push gate block in CLAUDE.md.
# The hook gates Case's own terminal too; only he can skip it (--no-verify). Claude
# never installs it: the deny text says to ask Case.
#
# Fails CLOSED.

# WORKTREES. The range and the clearance are resolved in the repo the push
# runs FROM (the hook's cwd, any `cd`, any `git -C`), not CLAUDE_PROJECT_DIR.
# A background session pushes from .claude/worktrees/<name>/ while the main
# checkout sits on main; reading HEAD from the main checkout made every
# worktree push resolve to an empty range and be denied (found 2026-10-03).
# /publish-review writes .session/publish-clearance at the root of the
# checkout it ran in, so that is where it is read from.

# No `cd "$CLAUDE_PROJECT_DIR"` here: every repo lookup below is `git -C`
# against the push's own checkout, and the old `cd … || exit 0` failed OPEN
# when that directory did not exist.

INPUT="$(cat)"

emit_deny() {
  R="$1" python3 -c 'import json,os;print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":os.environ["R"]}}))' 2>/dev/null && exit 0
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"The publication gate could not emit its decision. Nothing has been cleared for publication. Tell Case the gate is non-functional on this machine."}}
JSON
  exit 0
}

# A note that rides along with an ALLOW. No permissionDecision at all, so Claude
# Code carries on exactly as if this hook had said nothing; only additionalContext
# (documented for PreToolUse in 2.1.299) reaches the model. If python3 fails the
# note is simply dropped: a warning must never turn into a decision.
emit_note() {
  N="$1" python3 -c 'import json,os;print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":os.environ["N"]}}))' 2>/dev/null
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

# --- Anything that would switch the git-native pre-push hook off -------------
# Scanned on the RAW text, before the split below, so a wrapper (bash -c, env,
# a subshell) cannot hide the literal from it; quotes and backslashes are
# stripped first so core.hooks""Path is still seen. Each of these was verified
# to skip the hook: core.hooksPath set per command, the hook-skip flag (git
# accepts it abbreviated down to --no-veri), GIT_CONFIG_COUNT / _PARAMETERS /
# _KEY_n, and send-pack, which publishes with no hook at all. Known false
# positive: text that merely MENTIONS them, such as a commit message or a grep.
# Use git commit -F FILE, or search for hooksPath without the "core." prefix.
flat = re.sub("[\"\x27\\\\]", "", cmd.lower())

# push as a WORD. A bare \bpush\b also matched pre-push, push-gate and .push, so a diff
# of the hook (git diff -- .githooks/pre-push) was read as a push.
PUSH = r"(?<![\w./-])push(?![\w.-])"
# git ... push inside ONE command: the span stops at a command separator, so a
# `git fetch && git push` is not read as one wrapped command.
GITCMD = r"(?<![\w./-])git\s"        # git as a command word: not .git/config, not a path ending in git
GITPUSH = r"\bgit\b[^;&|\n]*?" + PUSH
QUOTES = "[\"\x27\\\\]"

# core.hooksPath: READING it is fine in every form (--get, --get-all, --show-origin,
# --show-scope, a bare key, `get`, inside $( ) or backticks); anything else that names
# it, a write, an unset, -c core.hooksPath=..., is refused. The reads are cut out of
# each command first and what still names the key is the problem.
READ_HP = re.compile(
    r"\bgit(?:\s+-C\s+\S+)*\s+config"
    r"(?:\s+(?:--local|--global|--system|--worktree|--show-origin|--show-scope|--null|-z"
    r"|--name-only|--includes|--no-includes|--default\s+\S+|-f\s+\S+|--file\s+\S+"
    r"|--type\s+\S+|--get-all|--get|get))*"
    r"\s+(?i:core\.hookspath)(?=\s*(?:$|[;&|)`<>]|\d[<>]))")

off = ""
if "core.hookspath" in flat:
    for seg in re.split(r"(?:\|\||&&|;|\||\n)", cmd):
        st = READ_HP.sub(" ", re.sub(QUOTES, "", seg))
        if "core.hookspath" in st.lower():
            off = "core.hooksPath"
            break
# The hook-skip flag, in ANY command Claude runs, not only one that says "push".
# Nothing legitimate is lost: with
# core.hooksPath on the installed copy there is no pre-commit or commit-msg hook
# for `git commit --no-verify` to skip. git accepts the flag abbreviated down to
# --no-veri (anything shorter is ambiguous with --no-verbose). The regex ends the
# word, so --no-verify-signatures (a merge and pull option, not a hook skip) is not
# refused. `-n` is NOT in this list: on `git push` it is --dry-run, which still
# runs the hook, so refusing it would block a harmless dry run and close nothing.
# Known false positive: text that merely MENTIONS the flag (a grep, a message): grep
# for no-verify without the dashes.
if not off and re.search(r"--no-veri(?:fy?)?(?![a-z0-9-])", flat):
    off = "the hook-skip flag"
if not off and ("git_config_count" in flat or "git_config_parameters" in flat or "git_config_key_" in flat):
    off = "GIT_CONFIG_*"
# send-pack publishes with no hook at all. Refused as a git COMMAND, not as a word
# (a grep for it, or git log --grep=send-pack, is not a send-pack).
if not off and re.search(r"(?:" + GITCMD + r"(?:[^;&|\n]*\s)?|(?<![\w./-])git-)send-pack(?![\w-])", flat):
    off = "send-pack"
# Two more edits to the config that drop core.hooksPath without naming it: removing
# or renaming the whole core section, and opening the file in an editor.
if not off and re.search(r"--(?:remove|rename)-section\s+core(?![a-z0-9._-])", flat):
    off = "core.hooksPath (removing or renaming the core section drops it)"
if not off and re.search(GITCMD + r"[^;&|\n]*\bconfig\b[^;&|\n]*\s(?:-e|--edit)(?![a-z0-9-])", flat):
    off = "core.hooksPath (git config --edit can drop it)"
# Pointing git at ANOTHER repository by environment, or at another remote by --repo. The
# hook runs only in a repo whose config names it, so a clone it was never installed in
# (a fresh clone, a scratch copy, the ops clone) escapes it, and this script resolves
# the repo from the cwd, which these defeat. Only when the text says push; a lone
# GIT_DIR= for a log is left alone. (The git options --git-dir, --work-tree and -c are
# judged below, where the push subcommand is actually found.) Known false positive: a
# message that names these next to the word push.
if not off and re.search(PUSH, flat) and re.search(r"(?:^|[^a-z0-9_])git_(?:dir|work_tree|common_dir|object_directory)=", flat):
    off = "GIT_DIR / --git-dir / --work-tree / git -c"
# Config FILES git reads from the environment, and a different home. The ops exemption
# resolves URLs in the environment of this script, so a push command that swaps the global or
# system config (url.*.insteadOf in it) or the home directory is judged on a URL it will
# not use.
if not off and re.search(PUSH, flat) and re.search(r"(?:^|[^a-z0-9_])(?:git_config_(?:global|system)|xdg_config_home|home)=", flat):
    off = "GIT_CONFIG_GLOBAL / GIT_CONFIG_SYSTEM / HOME / XDG_CONFIG_HOME"
# Transport overrides: the URL still reads as the ops repo while the push is sent
# somewhere else by an ssh command, a proxy command or core.gitProxy. (This also refuses
# a plain READ of core.sshCommand; that is rare and fails closed.)
if not off and re.search(r"(?:^|[^a-z0-9_])git_(?:ssh|ssh_command|proxy_command)=|core\.(?:sshcommand|gitproxy)", flat):
    off = "a transport override (core.sshCommand, core.gitProxy, GIT_SSH, GIT_SSH_COMMAND, GIT_PROXY_COMMAND)"
# --repo=URL names the destination, and git takes any unique prefix (--rep, --repo). Scoped
# to a git command so gh ... --repo X ... with the word push in a title is left alone.
if not off and re.search(PUSH, flat) and re.search(GITCMD + r"[^;&|\n]*\s--repo?(?![a-z0-9-])", flat):
    off = "git push --repo"
# A wrapped push: this script otherwise sees a push only when git is the first word of
# a command, so a shell -c string, eval, xargs, env (also by path), exec, sudo, nohup,
# timeout, time, command, nice, setsid, stdbuf, flock, find -exec, watch, ionice,
# caffeinate, a ( ) or { } group, $( ) or backticks hid it, in a clone where the inner
# hook is not installed. Deliberately broad: it refuses anything of these shapes that
# also names git and push, in that order, in one command. `bash x.sh && git push` and
# `git add .env.example && git push` are plain pushes and are not touched.
WRAPPERS = "eval|xargs|env|exec|sudo|doas|nohup|timeout|time|command|nice|setsid|stdbuf|flock|find|watch|ionice|caffeinate"
if not off and re.search(
        r"(?:^|[\s;&|(`])(?:\S*/)?(?:ba|z|da|k)?sh\b[^;&|\n]*?\s-\w*c\b[^\n]*?" + GITPUSH
        + r"|(?:^|[;&|\n(]\s*)(?:(?:then|do|else|elif|if|while|until|!)\s+)*(?:\S*/)?(?:" + WRAPPERS + r")\b[^;&|\n]*?" + GITPUSH
        + r"|[({`]\s*[^)}`\n]*?\bgit\b[^;&|)}`\n]*?" + PUSH, flat):
    off = "a wrapped git push (run it as a plain command)"
# The gate own files, the config, and the refs the hook measures from. A WRITE-ish
# command that names them is refused: a redirect into them, tee, cp, mv, rm, ln,
# chmod and friends, sed -i, git config (not a read), git update-ref, and git
# symbolic-ref with a value. Reads stay allowed. A speed bump, not a wall.
TARGET = (r"(?<![\w.-])push-gate(?![\w.-])|\.git/config|config\.worktree|refs/remotes"
          r"|\.git/refs|packed-refs|extensions\.worktreeconfig")
GIT_READ = r"\s(?:--get(?:-all|-regexp|-urlmatch|-color|-colorbool)?|--list|-l|list|get)(?=\s|$)"
if not off:
    for gseg in re.split(r"(?:\|\||&&|;|\||&|\)|\n)", cmd):
        sl = re.sub(QUOTES, "", gseg.lower())
        if re.search(GITCMD + r"[^;&|\n]*\bupdate-ref\b", sl):
            off = "git update-ref moves a ref the hook measures from; the push gate files"
            break
        if re.search(GITCMD + r"[^;&|\n]*\bsymbolic-ref\b", sl):
            try:
                gt = shlex.split(gseg)
            except ValueError:
                gt = gseg.split()
            if "symbolic-ref" in gt:
                ga = gt[gt.index("symbolic-ref") + 1:]
                pos = []
                skip = False
                for x in ga:
                    if skip:
                        skip = False
                    elif x == "-m":
                        skip = True
                    elif not x.startswith("-"):
                        pos.append(x)
                if "-d" in ga or "--delete" in ga or len(pos) >= 2:
                    off = "git symbolic-ref with a value; the push gate files"
                    break
        if not re.search(TARGET, sl):
            continue
        writes = (re.search(r">{1,2}\s*[^\s;&|<>]*(?:" + TARGET + r")", sl)
                  or re.search(r"(?:^|[\s;&|(`])(?:tee|cp|mv|rm|ln|chmod|chown|truncate|dd|install|rsync|touch|unlink|shred|patch)\s", sl)
                  or re.search(r"\bsed\b[^;&|\n]*\s-[a-z]*i\S*", sl)
                  or re.search(r"\bsed\b[^;&|\n]*\s--in-place", sl)
                  or (re.search(GITCMD + r"[^;&|\n]*\bconfig\b", sl) and not re.search(GIT_READ, sl)))
        if writes:
            off = "a write to the push gate files, the git config or refs/remotes"
            break
if off:
    print("HOOK_OFF:" + off)
    sys.exit(0)
# Claude does not RUN the installer: the common spellings (a shell, source or a dot, a
# path, exec, env, sudo, bash -c) are refused. The plain form is not harmless: it
# installs a hook, and a hook is only as good as the file it comes from. Whole-text on
# purpose, like the scans above, so a wrapper (bash -c), an env prefix or a cd before it
# cannot hide it. NAMING the file is not running it: git add, git diff, git log, wc,
# cat, shellcheck, bash -n and a commit message that mentions it are all allowed (the
# shell word must start a command, and a bare path needs a slash). It is not airtight;
# known limits are in the private ops notes.
if re.search(
        r"(?:(?:^|[\s;&|(`])(?:\S*/)?(?:ba|z|da|k)?sh\s+(?:-(?!n\b)\S+\s+)*"
        r"|(?:^|[\s;&|(`])(?:source|exec|eval|xargs|nohup|command|time|sudo|env|timeout|nice)\s+(?:[^\s;&|]+\s+)*?"
        r"|(?:^|[;&|(`\n]\s*|\$\(\s*)(?:[a-z_][a-z0-9_]*=\S*\s+)*\.\s+)"
        r"[^\s;&|]*(?:\$\([^)]*\)[^\s;&|]*)?install-push-gate\.sh"
        r"|(?:^|[;&|(`\n]\s*|\$\(\s*)(?:[a-z_][a-z0-9_]*=\S*\s+)*[^\s;&|]*/install-push-gate\.sh", flat):
    print("RUN_INSTALLER")
    sys.exit(0)

cwd = d.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

def resolve(base, p):
    p = os.path.expanduser(p)
    return os.path.normpath(p if os.path.isabs(p) else os.path.join(base, p))

# Words that may stand in front of a command in compound shell syntax. The command
# after them is still a command (`if true; then git push`, `! git push`).
KW = ("then", "do", "else", "elif", "if", "while", "until", "!", "time")
ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
pushes = []
# Split on a single & and on ) too: `git status & git push` and a case arm `x) git push`
# are two commands. (A 2>&1 splits harmlessly: neither half is a push.)
for seg in re.split(r"(?:\|\||&&|;|\||&|\)|\n)", cmd):
    seg = seg.strip()
    if not seg:
        continue
    try:
        toks = shlex.split(seg)
    except ValueError:
        # A heredoc apostrophe is not a push. Only escalate if the segment
        # actually mentions push.
        if not re.search(PUSH, seg):
            continue
        toks = seg.split()
    while toks and (ASSIGN.match(toks[0]) or toks[0] in KW):
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
    redirected = False
    aliased = False
    while i < len(rest):
        t = rest[i]
        if t == "-C" and i + 1 < len(rest):
            repo = resolve(repo, rest[i + 1])
            i += 2
            continue
        # git options that aim the command at another repository or rewrite config for
        # it (-c remote.origin.pushurl=..., -c alias.x=push). Judged HERE, where the
        # subcommand is known, so `git -c color.ui=never log` is left alone.
        if t in ("--git-dir", "--work-tree", "--config-env"):
            redirected = True
            i += 2
            continue
        if t == "-c":
            redirected = True
            if i + 1 < len(rest) and rest[i + 1].lower().startswith("alias."):
                aliased = True
            i += 2
            continue
        if t.startswith(("--git-dir=", "--work-tree=", "--config-env=")):
            redirected = True
            i += 1
            continue
        if t.startswith("-"):
            i += 1
            continue
        if redirected and (t == "push" or aliased):
            print("HOOK_OFF:GIT_DIR / --git-dir / --work-tree / git -c")
            sys.exit(0)
        if t == "push":
            remote = ""
            delete = False
            args = rest[i + 1:]
            j = 0
            while j < len(args):
                a = args[j]
                # These take the NEXT word as their value. Reading that value as the
                # remote let `git push -o <ops url> origin HEAD` borrow the private
                # repo exemption for a public push. (-ofoo and --push-option=foo are
                # one word, so they fall into the generic flag skip below.)
                if re.match(r"--repo?(=|$)", a):
                    print("HOOK_OFF:git push --repo")
                    sys.exit(0)
                if a in ("-o", "--push-option", "--receive-pack", "--exec"):
                    j += 2
                    continue
                if a in ("--delete", "-d"):
                    delete = True
                    j += 1
                    continue
                if a.startswith("-"):
                    j += 1
                    continue
                if not remote:
                    remote = a
                elif a.lstrip("+").startswith(":"):
                    delete = True
                j += 1
            pushes.append("GIT_PUSH\t" + repo + "\t" + ("1" if delete else "0") + "\t" + remote)
        break
for line in pushes:
    print(line)
' 2>/dev/null)"
# A crash is not a verdict. An uncaught exception (a "command" that is not a
# string, say) leaves empty output, which the case below would read as "not a
# push" and allow. Python exits non-zero on any such failure, so that is
# unreadable input, the same as a parse error.
[ $? -eq 0 ] || CLASS="PARSE_ERROR"

case "$CLASS" in
  PARSE_ERROR*)
    emit_deny "The publication gate could not read its own hook input, so it cannot tell whether this is a push. Denying. Tell Case the gate is non-functional."
    ;;
  HOOK_OFF:*)
    emit_deny "BLOCKED: this command would switch off or go around the git push hook, push in a form this guard cannot check, or write to the push gate itself (${CLASS#HOOK_OFF:}). The push gate has two layers and Claude may not disable the inner one; only Case, from his own terminal, can skip it. Write a push as a plain git push command. If the text merely mentions these words (a commit message, a PR body, a grep), reword it or move the text into a file: git commit -F FILE for a commit message, gh pr create --body-file FILE for a PR body. To search for the hook-skip flag, grep for no-verify without the dashes. To read the hooks path, use: git config --get core.hooksPath"
    ;;
  RUN_INSTALLER*)
    emit_deny "BLOCKED: running install-push-gate.sh is Case's call, not Claude's (the common spellings of running it are refused: a shell, source, a path, exec, env, sudo). The installer decides which hook counts as the push gate, so the person the gate protects runs it. Ask Case to run it from the MAIN checkout in his own terminal. Reading it (cat, the Read tool, git show), diffing it, bash -n and staging it (git add) are fine; if a command that only names the file was refused, list the file on its own or stage with git add -A."
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
# Is EVERY url this push would use the ops repo? This is decided by TEXT, in a clone
# (docs/private) that can never have the git hook, so it has to be strict:
#  - every push url, not just the first (a remote can push to several: get-url --all);
#  - grep -E matches line by line, so a URL with a second line, or any other control
#    character, is refused whole;
#  - a literal URL is rewritten by url.*.insteadOf, which this script does not apply, and
#    a remote can be NAMED like a URL while pointing somewhere else: refuse in both cases.
ops_ok() { # DIR REMOTE-OR-URL
  local d="$1" r="$2" urls u n=0
  case "$r" in *[[:cntrl:]]*) return 1 ;; esac
  if printf '%s' "$r" | grep -qE '://|@'; then
    [ -z "$(git -C "$d" config --get-regexp '^url\..*\.(push)?insteadof$' 2>/dev/null)" ] || return 1
    git -C "$d" config --name-only --get-regexp '^remote\.' 2>/dev/null | grep -iF "remote.${r}." >/dev/null && return 1
    urls="$r"
  else
    # One config value with a newline inside it prints like two values. Count the
    # newlines in the values themselves (-z keeps each value whole): any is a refusal.
    for k in url pushurl; do
      [ "$(git -C "$d" config -z --get-all "remote.${r}.${k}" 2>/dev/null | tr -d '\0' | wc -l | tr -d ' ')" = 0 ] || return 1
    done
    urls="$(git -C "$d" remote get-url --push --all "$r" 2>/dev/null)"
  fi
  [ -n "$urls" ] || return 1
  while IFS= read -r u; do
    case "$u" in *[[:cntrl:]]*) return 1 ;; esac
    printf '%s' "$u" | grep -qE "$OPS_URL_RE" || return 1
    n=$((n + 1))
  done <<EOF2
$urls
EOF2
  [ "$n" -ge 1 ]
}
GATED_DIRS=""
while IFS="$(printf '\t')" read -r KIND PDIR PDEL PREMOTE; do
  [ "$KIND" = "GIT_PUSH" ] || continue
  if [ -z "$PREMOTE" ]; then
    PB="$(git -C "$PDIR" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    PREMOTE="$(git -C "$PDIR" config "branch.${PB}.pushRemote" 2>/dev/null)"
    [ -n "$PREMOTE" ] || PREMOTE="$(git -C "$PDIR" config remote.pushDefault 2>/dev/null)"
    [ -n "$PREMOTE" ] || PREMOTE="$(git -C "$PDIR" config "branch.${PB}.remote" 2>/dev/null)"
    [ -n "$PREMOTE" ] || PREMOTE="origin"
  fi
  if ops_ok "$PDIR" "$PREMOTE"; then
    continue
  fi
  # A delete publishes nothing new, so there is no range to clear. The git hook lets
  # Case delete from his own terminal; Claude may not (gh-pages is the live site).
  if [ "$PDEL" = 1 ]; then
    emit_deny "BLOCKED: this push deletes a remote branch or tag (--delete, -d or a :ref refspec). A delete publishes nothing new, so there is no range for /publish-review to clear, and the live site's gh-pages branch is one of the things it could remove. Deleting is Case's call, from his own terminal (the git hook lets his deletes through)."
  fi
  GATED_DIRS="${GATED_DIRS:+${GATED_DIRS}
}${PDIR}"
done <<EOF
$CLASS
EOF
[ -n "$GATED_DIRS" ] || exit 0

# --- Per gated push: resolve its range and require clearance for it ----------
# Each push is checked in its OWN repo, so `git -C <worktree> push` from the
# main checkout, or a plain push from inside a worktree, both resolve against
# the worktree's HEAD and the worktree's .session/publish-clearance.
while IFS= read -r PDIR; do
  # Never skip: in a gate, "skip" is the fail-open shape.
  if [ -z "$PDIR" ]; then
    emit_deny "BLOCKED: the publication gate resolved an empty push directory, so it cannot identify what would be published. Denying."
  fi

  TOP="$(git -C "$PDIR" rev-parse --show-toplevel 2>/dev/null)"
  if [ -z "$TOP" ]; then
    emit_deny "BLOCKED: the publication gate could not find a git repository at '${PDIR}', so it cannot identify what would be published. Denying."
  fi
  # The git-native hook is the real gate: this script cannot see a wrapped push
  # (bash -c, env, a subshell), the hook can. A push from a clone that does not
  # have it switched on would be unguarded against all of those, so a missing,
  # relative, non-executable or unmarked hook is a deny, never a silent allow.
  # "Absolute" includes the spelling Git Bash reports: its git returns C:/Users/...
  # (or C:\Users\...) for what the installer wrote as /c/Users/..., so a drive
  # letter followed by / or \ counts, and a bare "C:gate" (relative to the drive's
  # current directory) does not. Keep this in step with session-start.sh; the
  # harness feeds both the same spellings.
  HOOKS_RAW="$(git -C "$TOP" config --get core.hooksPath 2>/dev/null)"
  HOOKS_PATH="$HOOKS_RAW"
  case "$HOOKS_PATH" in
    /?*|[A-Za-z]:/?*|[A-Za-z]:\\?*|\\\\?*) ;;
    *) HOOKS_PATH="" ;;
  esac
  if [ -z "$HOOKS_PATH" ] || [ ! -x "${HOOKS_PATH}/pre-push" ] || ! grep -q 'roastlogs-push-gate v1' "${HOOKS_PATH}/pre-push" 2>/dev/null; then
    emit_deny "BLOCKED: the git push hook is not installed in ${TOP} (core.hooksPath is '${HOOKS_RAW:-unset}'; it must be an absolute path to a directory holding an executable pre-push that carries the push-gate marker), so a wrapped or re-targeted push there would not be checked. Ask Case to run, from the main checkout of that clone: bash .claude/tools/install-push-gate.sh (it copies the committed hook into the git directory and sets core.hooksPath to it). Claude does not run it. Then re-run the push. Read the status with: git config --get core.hooksPath. In a claude.ai session container, which is a fresh clone every time, Case adds bash .claude/tools/install-push-gate.sh to that environment's Setup script (environment menu in the session title bar, Edit, Setup script) so that it runs after the repo is cloned; Case should confirm the setup script runs after the clone."
  fi
  # The marker and the exec bit prove nothing about what the copy DOES: a stub that
  # keeps both passes them, and a copy edited after install passes them too. So the
  # copy is trusted only if it IS a committed version of the hook: this checkout's
  # committed .githooks/pre-push (HEAD), origin/main's, or local main's (the
  # installer's source in the main checkout). Never the work-tree file, which is just
  # as easy to edit as the copy. origin/main and main are accepted so a worktree on an
  # older branch, or on one with no .githooks/ at all, still passes when the installed
  # copy is the main version. The comparison is BYTE for byte against the blob with
  # carriage returns removed from the BLOB side only: sh does not ignore a CR (`deny<CR>
  # "..."` is a different command), so a copy that has them is not the committed hook
  # even though its text looks identical. If no committed version matches, that is a
  # DENY: a warning here would reach only Claude, which is the party being checked.
  copy_is() { # REF: the copy equals REF's committed hook (blob CRs removed)
    git -C "$TOP" cat-file -e "$1:.githooks/pre-push" 2>/dev/null || return 1
    git -C "$TOP" show "$1:.githooks/pre-push" 2>/dev/null | tr -d '\r' | cmp -s - "${HOOKS_PATH}/pre-push"
  }
  KNOWN_GOOD=0
  HEAD_HAS_HOOK=0
  git -C "$TOP" cat-file -e "HEAD:.githooks/pre-push" 2>/dev/null && HEAD_HAS_HOOK=1
  if [ "$HEAD_HAS_HOOK" -eq 1 ] && copy_is HEAD; then
    KNOWN_GOOD=1
  elif copy_is refs/remotes/origin/main; then
    KNOWN_GOOD=1
    SRC_NAME="origin/main"
  elif copy_is refs/heads/main; then
    KNOWN_GOOD=1
    SRC_NAME="local main"
  fi
  # A known-good copy that is not THIS branch's hook: it is the older (or other) one.
  # Allowed, with a note for the session.
  if [ "$KNOWN_GOOD" -eq 1 ] && [ -n "${SRC_NAME:-}" ] && [ "$HEAD_HAS_HOOK" -eq 1 ]; then
    STALE_NOTE="push gate: the installed pre-push hook (${HOOKS_PATH}/pre-push) matches ${SRC_NAME} but differs from the .githooks/pre-push committed in ${TOP}. Nothing is blocked. If this branch has the newer hook, ask Case to pull main in the main checkout and re-run: bash .claude/tools/install-push-gate.sh"
  fi
  if [ "$KNOWN_GOOD" -ne 1 ]; then
    if git -C "$TOP" cat-file -e "refs/remotes/origin/main:.githooks/pre-push" 2>/dev/null; then
      emit_deny "BLOCKED: the installed push hook (${HOOKS_PATH}/pre-push) matches none of the committed versions (this checkout's HEAD, origin/main, local main), so it may have been edited or replaced, and a marker and an exec bit do not prove what it does. Ask Case to pull main in the main checkout, then re-run in his own terminal: bash .claude/tools/install-push-gate.sh (it installs origin/main's hook). If origin/main is stale, git fetch first."
    else
      emit_deny "BLOCKED: the installed push hook (${HOOKS_PATH}/pre-push) matches none of the committed versions this checkout can see (HEAD, local main), and origin/main does not carry .githooks/pre-push yet, so there is nothing reviewed to compare it with. Install after the gate reaches origin/main: merge, push, then Case runs, from the main checkout in his own terminal: bash .claude/tools/install-push-gate.sh"
    fi
  fi

  CLEARANCE="${TOP}/.session/publish-clearance"

  BR="$(git -C "$TOP" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  HEAD_SHA="$(git -C "$TOP" rev-parse HEAD 2>/dev/null)"
  if [ -z "$HEAD_SHA" ]; then
    emit_deny "BLOCKED: the publication gate could not resolve HEAD in '${TOP}', so it cannot identify what would be published. Denying."
  fi

  if git -C "$TOP" rev-parse --verify "origin/$BR" >/dev/null 2>&1; then
    BASE_SHA="$(git -C "$TOP" rev-parse "origin/$BR" 2>/dev/null)"
  else
    BASE_SHA="$(git -C "$TOP" merge-base origin/main HEAD 2>/dev/null)"
  fi
  [ -n "$BASE_SHA" ] || BASE_SHA="root"

  RANGE="${BASE_SHA}..${HEAD_SHA}"

  # Exact-match on both SHAs is the point: a new commit moves HEAD, so
  # yesterday's clearance cannot launder today's content.
  if [ ! -f "$CLEARANCE" ]; then
    emit_deny "BLOCKED: nothing has been cleared for publication. This repo is PUBLIC and a push is irreversible — forks, clones and caches keep the content reachable even after a force-push. Run /publish-review to have publication-reviewer examine the outbound diff, every commit message in the range, and any newly tracked files. It writes clearance only on a 'clear' verdict. Checkout: ${TOP}. Range needing review: ${RANGE}"
  fi

  CLEARED="$(tr -d ' \t\n\r' < "$CLEARANCE" 2>/dev/null)"
  if [ "$CLEARED" != "$RANGE" ]; then
    emit_deny "BLOCKED: the publication clearance on file does not match what this push would publish. Checkout: ${TOP}. Cleared: '${CLEARED:-none}'. This push: '${RANGE}'. A clearance covers one exact range, so any new commit voids it by design. Re-run /publish-review for the current range."
  fi
done <<EOF
$GATED_DIRS
EOF

# Allowed. If the installed copy looked stale, say so alongside the allow. (The
# loop above is fed by a here-document, so it ran in this shell and set the note.)
[ -z "${STALE_NOTE:-}" ] || emit_note "$STALE_NOTE"
exit 0
