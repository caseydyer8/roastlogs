#!/usr/bin/env bash
# End-to-end tests for the push gate (RL-031..035): the outer text guard
# (.claude/hooks/pre-push-guard.sh) plus the git-native hook (.githooks/pre-push).
#
#   bash .claude/tools/test-push-gate.sh [--tags A,B] [--exclude A,B] [--baseline REV]
#       [--hook FILE] [--guard FILE] [--installer FILE] [--quiet] [--keep]
#
# HOW. Nothing here talks to GitHub and nothing here touches this repo's state.
# Every probe runs in a throwaway fixture under mktemp -d: a public-like repo
# with a LOCAL BARE origin, an ops-like repo whose origin is the literal private
# ops URL, a linked worktree, an uncleared branch and an uncleared tag. The
# environment is isolated (HOME, no global/system config, every GIT_CONFIG_*
# variable unset, GIT_ALLOW_PROTOCOL=file so https/ssh are refused outright,
# GIT_CEILING_DIRECTORIES so git cannot discover the real repo from a fixture).
#
# Each probe imitates Claude Code. It pipes PreToolUse JSON into the guard and,
# only if the guard allows, runs the command in the fixture. PASS means the bare
# remote holds no commit that was not cleared. A FAIL prints the uncleared SHA
# that reached it. Every leak probe also runs a CONTROL (the same command with
# the text guard out of the way) and FAILs as vacuous if the control does not
# leak, so a command that merely errors can never pass for "blocked".
#
# TAGS (one per ledger id, plus the supporting checks):
#   RL-031  commit-then-push         RL-032  refspecs, --all, --tags, --mirror
#   RL-033  GIT_DIR / --git-dir      RL-034  push-option confused for the remote
#   RL-035  wrappers (bash -c, env, subshell, xargs, alias, &)
#   HD      ways to switch the git hook off      G  guard decisions added with it
#   L       legitimate pushes still work; ops exemption; fail-closed paths
#   T       Case's own terminal               HOOK  the hook called directly
#   INST    install-push-gate.sh              WIRE  session-start, verify and state-hash wiring
#   NET     the sandbox cannot reach GitHub
#   SELF    this repo's state is unchanged by the run
#   WIN     Windows (Git Bash) hooks paths    COPY  the installed copy of the hook
#   RESID   pinned residual probes; they live in the private ops repo and SKIP when it is
#           absent.
#   DOC     the written instructions say what the gate now does. Wording lint (this
#           includes the comment lint on session-start.sh): it runs in a standalone
#           run, but verify.sh passes --exclude DOC, so rewording a document can never
#           fail the commit gate.
#   CACHE   verify-push-gate.sh: the skip-when-unchanged cache for verify.sh [3/6]
#
# WIN. Git Bash reports core.hooksPath as C:/Users/... (or C:\Users\...) where the
# installer wrote /c/Users/..., and this harness cannot run MINGW. So the path
# CLASSIFICATION is tested on Linux by feeding those spellings: a drive-letter path
# is relative here, which lets a probe place the "installed" hook at
# $FIXTURE/C:/Users/case/gate/pre-push (the guard and session-start both run with
# the fixture as their working directory). A fake cygpath stands in for MSYS's.
# Those fixtures only mean something on Linux. Under uname MINGW*/MSYS*/CYGWIN* (the
# laptop) a drive-letter path is REAL there, and a file that starts with #! always
# counts as executable (no chmod 644 can model "not executable"). The WIN probes and
# the chmod-644 probes therefore record SKIP, with that reason, rather than FAIL
# verify.sh on the one machine that cannot run them. (PUSH_GATE_UNAME overrides
# `uname -s`, to exercise that path on Linux.)
# Path spellings are compared through normalising helpers (cd && pwd -P, -ef, cygpath -u)
# because Git for Windows prints C:/Users/... where Git Bash prints /c/Users/.... Case runs
# `bash .claude/tools/test-push-gate.sh` once on each
# machine (the laptop; the Mac, which lacks GNU timeout, env -C and GNU sed) and it must
# exit 0 before verify.sh [3/6] is relied on there.
# COST. About 2 to 2.5 minutes on a quiet 4-core Linux box (roughly 0.3 s per probe,
# spent spawning git and python); slower under load and on Git Bash. verify.sh therefore
# skips the whole step when the gate files are unchanged since the last pass.
#
# --baseline REV runs the same probes against the guard (and .githooks/pre-push,
# if any) as they were at REV, so fail-first can be reproduced at review time:
# against the pre-gate commit it must EXIT 1 with FAILs under RL-031..035.
# --hook FILE / --guard FILE / --installer FILE substitute the hook, the guard or the
# installer under test (a hook stub that always exits 0 must make this fail; the
# mutation checks use all three). --tags keeps only those tags, --exclude drops
# them (exclude wins). --quiet prints only FAILs and the summary.
# Exit: 0 all pass, 1 any FAIL, 2 cannot run.

set -u

REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
BASELINE=""
TAGS=""
EXCLUDE=""
HOOK_OVERRIDE="${PUSH_GATE_HOOK:-}"
GUARD_OVERRIDE=""
INSTALLER_OVERRIDE=""
QUIET=0
KEEP=0

usage() {
  awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "$0"
  exit "${1:-2}"
}

die() {
  echo "test-push-gate: $1" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --baseline) [ $# -ge 2 ] || usage; BASELINE="$2"; shift 2 ;;
    --tags)     [ $# -ge 2 ] || usage; TAGS="$2"; shift 2 ;;
    --exclude)  [ $# -ge 2 ] || usage; EXCLUDE="$2"; shift 2 ;;
    --installer) [ $# -ge 2 ] || usage; INSTALLER_OVERRIDE="$2"; shift 2 ;;
    --hook)     [ $# -ge 2 ] || usage; HOOK_OVERRIDE="$2"; shift 2 ;;
    --guard)    [ $# -ge 2 ] || usage; GUARD_OVERRIDE="$2"; shift 2 ;;
    --quiet)    QUIET=1; shift ;;
    --keep)     KEEP=1; shift ;;
    -h|--help)  usage 0 ;;
    *)          echo "unknown argument: $1" >&2; usage 2 ;;
  esac
done

command -v git >/dev/null 2>&1 || die "git is required."
command -v python3 >/dev/null 2>&1 || die "python3 is required (the guard under test needs it too)."

W="$(mktemp -d "${TMPDIR:-/tmp}/pgate.XXXXXX")" || die "cannot create a scratch directory."
W="$(cd "$W" && pwd -P)"
case "$W/" in "$REPO"/*) rm -rf "$W"; die "scratch directory is inside the repo under test." ;; esac
case "$W" in /?*/pgate.*) ;; *) die "refusing odd scratch path '$W'." ;; esac
cleanup() {
  if [ "$KEEP" -eq 1 ]; then echo "scratch kept: $W"; else rm -rf "$W"; fi
}
trap cleanup EXIT

# --- isolation ---------------------------------------------------------------
# Applies to every process below. The ambient GIT_CONFIG_* variables (URL
# rewrites for a proxy, for instance) would otherwise leak into the fixtures,
# and a probe that sets them itself must be the only source.
export HOME="$W/home"
mkdir -p "$HOME"
export XDG_CONFIG_HOME="$HOME/.config"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_ALLOW_PROTOCOL=file GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false SSH_ASKPASS=/bin/false
export GIT_CEILING_DIRECTORIES="$W"
export GIT_EDITOR=true
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY \
      GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_PREFIX GIT_CONFIG \
      GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS GIT_EXEC_PATH GIT_SSH GIT_SSH_COMMAND \
      HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
for v in $(env | cut -d= -f1 | grep -E '^GIT_CONFIG_(KEY|VALUE)_[0-9]+$'); do unset "$v"; done

# --- what is under test ------------------------------------------------------
INSTALLER="${INSTALLER_OVERRIDE:-$REPO/.claude/tools/install-push-gate.sh}"
if [ -n "$BASELINE" ]; then
  MODE=baseline
  mkdir -p "$W/baseline"
  GUARD="$W/baseline/pre-push-guard.sh"
  git -C "$REPO" show "$BASELINE:.claude/hooks/pre-push-guard.sh" > "$GUARD" 2>/dev/null \
    || die "cannot read .claude/hooks/pre-push-guard.sh at '$BASELINE'."
  HOOK_SRC=""
  if git -C "$REPO" cat-file -e "$BASELINE:.githooks/pre-push" 2>/dev/null; then
    HOOK_SRC="$W/baseline/pre-push"
    git -C "$REPO" show "$BASELINE:.githooks/pre-push" > "$HOOK_SRC"
    chmod 755 "$HOOK_SRC"
  fi
  LABEL="baseline $BASELINE ($( [ -n "$HOOK_SRC" ] && echo 'guard + hook' || echo 'guard only, no git hook exists'))"
else
  MODE=current
  GUARD="${GUARD_OVERRIDE:-$REPO/.claude/hooks/pre-push-guard.sh}"
  HOOK_SRC="${HOOK_OVERRIDE:-$REPO/.githooks/pre-push}"
  [ -f "$GUARD" ] || die "missing $GUARD"
  [ -f "$HOOK_SRC" ] || die "missing hook under test: $HOOK_SRC"
  LABEL="current tree${HOOK_OVERRIDE:+ (hook overridden: $HOOK_OVERRIDE)}${GUARD_OVERRIDE:+ (guard overridden: $GUARD_OVERRIDE)}${INSTALLER_OVERRIDE:+ (installer overridden: $INSTALLER_OVERRIDE)}"
fi
if [ -n "$HOOK_SRC" ]; then
  mkdir -p "$W/hookdir"
  cp "$HOOK_SRC" "$W/hookdir/pre-push"
  chmod 755 "$W/hookdir/pre-push"
fi
OPSURL='https://github.com/caseydyer8/roastlogs-ops'
ZERO='0000000000000000000000000000000000000000'

# --- this repo must come out exactly as it went in ---------------------------
# Read-only commands only. GIT_OPTIONAL_LOCKS=0 stops `status` refreshing the index.
# Only what THIS run could touch: HEAD, the local config, the current branch's own
# ref, and the status of the gate's own directories. NOT every ref and NOT the whole
# status: refs are shared by every worktree, so a parallel agent committing in
# another one (the /work and /ship flows do) during a run of a couple of minutes would otherwise
# fail verify.sh under the label "push gate" for something unrelated. (The exclude:
# other worktrees live under .claude/worktrees/ and come and go while this runs.)
snapshot_real() {
  {
    git -C "$REPO" rev-parse HEAD
    git -C "$REPO" config --local --list
    BR_REF="$(git -C "$REPO" symbolic-ref -q HEAD)" && git -C "$REPO" rev-parse "$BR_REF"
    GIT_OPTIONAL_LOCKS=0 git -C "$REPO" status --porcelain -- .githooks .claude ':(exclude).claude/worktrees'
  } 2>&1 | cksum
}
SNAP_BEFORE="$(snapshot_real)"

# --- results -----------------------------------------------------------------
RESULTS="$W/results.tsv"
: > "$RESULTS"

record() { # TAG NAME PASS|FAIL|SKIP DETAIL
  printf '%s\t%s\t%s\t%s\n' "$1" "$3" "$2" "$4" >> "$RESULTS"
  case "$3" in
    PASS) [ "$QUIET" -eq 1 ] || printf '  [PASS] %-7s %s%s\n' "$1" "$2" "${4:+  ($4)}" ;;
    SKIP) [ "$QUIET" -eq 1 ] || printf '  [SKIP] %-7s %s  (%s)\n' "$1" "$2" "$4" ;;
    *)    printf '  [FAIL] %-7s %s\n           %s\n' "$1" "$2" "$4" ;;
  esac
}

want_tag() {
  local t
  t="$(printf '%s' "$1" | tr 'a-z' 'A-Z')"
  case ",$(printf '%s' "$EXCLUDE" | tr 'a-z' 'A-Z')," in
    *",$t,"*) return 1 ;;
  esac
  [ -z "$TAGS" ] && return 0
  case ",$(printf '%s' "$TAGS" | tr 'a-z' 'A-Z')," in
    *",$t,"*) return 0 ;;
  esac
  return 1
}

# Does this path name the same directory as that one? Equal strings; the same file on
# disk (-ef: a symlink, a trailing slash, a ..); or the same POSIX path through
# cygpath (Git Bash writes C:/Users/x for what /c/Users/x names). Never compare
# git's idea of a path with ours using `=`: they differ in spelling on Windows.
sd() { # A B
  [ -n "$1" ] && [ -n "$2" ] || return 1
  [ "$1" = "$2" ] && return 0
  if [ -e "$1" ] && [ -e "$2" ] && [ "$1" -ef "$2" ]; then return 0; fi
  if command -v cygpath >/dev/null 2>&1; then
    local a b
    a="$(cygpath -u "$1" 2>/dev/null)"; b="$(cygpath -u "$2" 2>/dev/null)"
    [ -n "$a" ] && [ "$a" = "$b" ] && return 0
    if [ -n "$a" ] && [ -n "$b" ] && [ -e "$a" ] && [ -e "$b" ] && [ "$a" -ef "$b" ]; then return 0; fi
  fi
  return 1
}
# Is DIR the scratch area or inside it, however each side spells it?
under_scratch() { # DIR
  local d
  d="$(cd "$1" 2>/dev/null && pwd -P)" || return 1
  case "$d/" in "$W"/*) return 0 ;; esac
  if command -v cygpath >/dev/null 2>&1; then
    d="$(cygpath -u "$1" 2>/dev/null)"
    case "$d/" in "$W"/*) return 0 ;; esac
  fi
  return 1
}
# GNU timeout, else Homebrew's gtimeout, else perl's alarm. Stock macOS has none of the
# first two. HAVE_TIMEOUT is about the BINARY NAMED `timeout`, because a probe's own
# command text says `timeout` and cannot be rewritten.
with_timeout() { # SECONDS CMD...
  if command -v timeout >/dev/null 2>&1; then timeout "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$@"
  else local n="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$n" "$@"
  fi
}
command -v timeout >/dev/null 2>&1 && HAVE_TIMEOUT=1 || HAVE_TIMEOUT=0
env -C . true >/dev/null 2>&1 && HAVE_ENV_C=1 || HAVE_ENV_C=0   # GNU env only; BSD env has no -C
# CRLF without sed: BSD sed writes a literal "r" for \r in the replacement.
crlf_of() { awk '{ printf "%s\r\n", $0 }' "$1" > "$2"; }
# A probe that needs a command this machine lacks records SKIP, never FAIL.
need() { # COMMAND TAG NAME -> 0 if present, else records SKIP and returns 1
  command -v "$1" >/dev/null 2>&1 && return 0
  want_tag "$2" && record "$2" "$3" SKIP "needs $1, which this machine does not have"
  return 1
}

# Windows (Git Bash / MSYS / Cygwin) cannot model two kinds of probe: a drive-letter
# path that is only "relative" on Linux, and a hook that is not executable (a file
# starting with #! always counts as executable there). Those record SKIP, never FAIL.
case "${PUSH_GATE_UNAME:-$(uname -s 2>/dev/null)}" in
  MINGW*|MSYS*|CYGWIN*) ON_WINDOWS=1 ;;
  *) ON_WINDOWS=0 ;;
esac
sim_skip() { # TAG NAME REASON -> returns 0 (after recording a SKIP) when this probe cannot run here
  [ "$ON_WINDOWS" -eq 1 ] || return 1
  want_tag "$1" && record "$1" "$2" SKIP "${3:-Linux-simulated path or mode; not modelled on Windows}"
  return 0
}

# --- fixtures ----------------------------------------------------------------
FXN=0
FX="" BARE="" PUB="" OPS="" WT="" UNH="" CFG="" FAKESSH=""
A0="" A="" C="" S=""
ALLOWED=""

cfg() { # a throwaway identity and no signing, local to the fixture repo
  git -C "$1" config user.name fixture
  git -C "$1" config user.email fixture@example.invalid
  git -C "$1" config commit.gpgsign false
  git -C "$1" config tag.gpgsign false
  git -C "$1" config gc.auto 0
}

fx_commit() { # DIR FILE MESSAGE
  printf '%s\n' "$3" > "$1/$2"
  git -C "$1" add "$2"
  git -C "$1" commit -q -m "$3"
}

# main (origin/main) = A, which already carries .githooks. Local: work = A + C
# (checked out), secret = A + S with a tag on it, wtb = A0 + a commit, in a
# linked worktree whose checkout has NO .githooks/. ops has the private URL.
# Built once as a template; every probe gets a fresh copy (about 20x cheaper
# than rebuilding, and the only path baked into a copy is origin's URL).
TPL=""
fx_new() {
  [ -n "$TPL" ] || fx_template
  FXN=$((FXN + 1))
  FX="$W/fx$FXN"
  cp -Rp "$TPL" "$FX"
  BARE="$FX/origin.git"
  PUB="$FX/pub"
  OPS="$FX/ops"
  WT="$FX/wt"
  git -C "$PUB" remote set-url origin "$BARE"
  A0="$TPL_A0"; A="$TPL_A"; C="$TPL_C"; S="$TPL_S"
  ALLOWED="$A0 $A $C"
}

fx_template() {
  TPL="$W/tpl"
  FX="$TPL"
  BARE="$FX/origin.git"
  PUB="$FX/pub"
  OPS="$FX/ops"
  mkdir -p "$FX"
  git init -q --bare "$BARE"
  git -C "$BARE" symbolic-ref HEAD refs/heads/main
  git -C "$BARE" config receive.advertisePushOptions true
  git init -q "$PUB"
  git -C "$PUB" symbolic-ref HEAD refs/heads/main
  cfg "$PUB"
  git -C "$PUB" config alias.pp push
  fx_commit "$PUB" README.md "base"
  A0="$(git -C "$PUB" rev-parse HEAD)"
  if [ -n "$HOOK_SRC" ]; then
    mkdir -p "$PUB/.githooks"
    cp "$HOOK_SRC" "$PUB/.githooks/pre-push"
    chmod 755 "$PUB/.githooks/pre-push"
    git -C "$PUB" add .githooks/pre-push
    git -C "$PUB" commit -q -m "add push gate"
  else
    fx_commit "$PUB" notes.txt "second"
  fi
  A="$(git -C "$PUB" rev-parse HEAD)"
  git -C "$PUB" remote add origin "$BARE"
  git -C "$PUB" push -q origin main 2>/dev/null
  git -C "$PUB" checkout -q -b secret
  fx_commit "$PUB" secret.txt "secret: not reviewed"
  S="$(git -C "$PUB" rev-parse HEAD)"
  git -C "$PUB" tag v-secret
  git -C "$PUB" checkout -q main
  git -C "$PUB" checkout -q -b work
  fx_commit "$PUB" work.txt "work: reviewed"
  C="$(git -C "$PUB" rev-parse HEAD)"
  git init -q "$OPS"
  git -C "$OPS" symbolic-ref HEAD refs/heads/main
  cfg "$OPS"
  fx_commit "$OPS" notes.md "ops note"
  git -C "$OPS" remote add origin "$OPSURL"
  TPL_A0="$A0"; TPL_A="$A"; TPL_C="$C"; TPL_S="$S"
}

fx_worktree() { # linked worktree on branch wtb = A0 + W, no .githooks/ in it
  git -C "$PUB" worktree add -q -b wtb "$WT" "$A0" 2>/dev/null
  fx_commit "$WT" wt.txt "worktree: reviewed"
}

# What /publish-review writes: the same commands as .claude/commands/publish-review.md.
range_for() {
  local d="$1" br head base
  br="$(git -C "$d" rev-parse --abbrev-ref HEAD)"
  head="$(git -C "$d" rev-parse HEAD)"
  if git -C "$d" rev-parse --verify "origin/$br" >/dev/null 2>&1; then
    base="$(git -C "$d" rev-parse "origin/$br")"
  else
    base="$(git -C "$d" merge-base origin/main HEAD)"
  fi
  printf '%s..%s' "$base" "$head"
}

fx_clear() {
  mkdir -p "$1/.session"
  range_for "$1" > "$1/.session/publish-clearance"
}

# Installs the gate in $PUB the way Case would. In baseline mode there is no
# installer yet, so wire the old hook, if the old tree had one.
fx_install() {
  [ -n "$HOOK_SRC" ] || return 0
  if [ "$MODE" = current ]; then
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1 || return 1
  else
    git -C "$PUB" config core.hooksPath "$PUB/.githooks"
  fi
}

# Preps: shape the fixture the probe starts from (none of them installs the hook).
p_plain()  { :; }
p_cleared() { fx_clear "$PUB"; }
p_secret_head() { git -C "$PUB" checkout -q secret; ALLOWED="$A0 $A"; }
p_existing() { # work = C already on the remote, plus a cleared C2 on top
  git -C "$PUB" push -q origin work 2>/dev/null
  fx_commit "$PUB" work2.txt "work: reviewed again"
  C2="$(git -C "$PUB" rev-parse HEAD)"
  fx_clear "$PUB"
  ALLOWED="$A0 $A $C $C2"
}
p_stale() { fx_clear "$PUB"; git -C "$PUB" commit -q --allow-empty -m "after clearance"; }
p_tagged() { # a lightweight and an annotated tag on the CLEARED commit
  fx_clear "$PUB"
  git -C "$PUB" tag v-cleared
  git -C "$PUB" tag -a v-note -m "release notes nobody reviewed" "$C"
}
# The ops checkout carries a clearance that matches the range of the public push
# below (secret on top of main). Whoever writes .session/ in a second checkout
# can forge this, so the hook must read the clearance of the repo that pushes.
p_forged_ops() {
  fx_clear "$PUB"
  mkdir -p "$OPS/.session"
  printf '%s' "${A}..${S}" > "$OPS/.session/publish-clearance"
}
# The real layout: the ops clone sits INSIDE the public work tree (docs/private).
p_nested_ops() {
  p_forged_ops
  mkdir -p "$PUB/docs"
  mv "$OPS" "$PUB/docs/private"
  OPS="$PUB/docs/private"
}
# A second clone of the same remote that the gate was never installed in (a fresh
# `git clone`, a scratch copy), holding a commit nobody reviewed. Anything that
# points git at it, or runs git inside it, escapes both layers unless the TEXT of
# the command is refused: the hook only runs in a repo whose config names it.
p_unhooked() {
  UNH="$FX/unh"
  git clone -q "$BARE" "$UNH" 2>/dev/null
  cfg "$UNH"
  git -C "$UNH" checkout -q -b secret
  fx_commit "$UNH" unh-secret.txt "secret: sitting in an unhooked clone"
}
p_unh_cleared() { fx_clear "$PUB"; p_unhooked; }
p_unh_ops() { p_unhooked; }
# The ops clone on a branch (so a push of it to a public bare creates a new branch).
p_ops_branch() { git -C "$OPS" checkout -q -b leakbr; }
# The ops clone pushes to TWO urls: the ops repo first, a public one second. `remote
# get-url --push` prints only the first; git pushes to both.
p_ops_multi() {
  git -C "$OPS" remote set-url --push origin "$OPSURL"
  git -C "$OPS" remote set-url --add --push origin "$BARE"
}
# A config FILE that rewrites the ops URL to the public bare repo. GIT_CONFIG_GLOBAL (and
# GIT_CONFIG_SYSTEM, HOME, XDG_CONFIG_HOME) point git at it for one command, and the
# guard, which resolves the ops URL in its own environment, never sees the rewrite.
p_ops_cfg() {
  p_ops_branch
  CFG="$FX/ops-redirect.cfg"
  printf '[url "%s"]\n\tinsteadOf = %s\n' "$BARE" "$OPSURL" > "$CFG"
}
# The ops remote spelled as an ssh URL, and a fake ssh that sends the push to the public
# bare repo instead: core.sshCommand / GIT_SSH_COMMAND change WHERE it goes, and the URL
# still reads as ops.
p_ops_ssh() {
  p_ops_branch
  git -C "$OPS" remote set-url origin 'git@github.com:caseydyer8/roastlogs-ops.git'
  FAKESSH="$FX/fakessh"
  printf '#!/bin/sh\nexec git-receive-pack "%s"\n' "$BARE" > "$FAKESSH"
  chmod 755 "$FAKESSH"
}
# An ops remote URL with a second line in it. grep -E matches line by line, so a
# URL like this passed an "anchored at both ends" test.
p_ops_newline() {
  git -C "$OPS" remote set-url origin "$(printf 'file:///nowhere\nhttps://github.com/caseydyer8/roastlogs-ops')"
}
# Cleared work, and a gh-pages branch already on the remote to delete.
# The same URL twice, one per line: every LINE is the ops URL, but the value is not a URL.
p_ops_newline_twice() {
  git -C "$OPS" remote set-url origin "$(printf '%s\n%s' "$OPSURL" "$OPSURL")"
}
# A tab inside the userinfo part: the ops pattern ([^@/]+@) allows any character there.
p_ops_ctrl_userinfo() {
  git -C "$OPS" remote set-url origin "$(printf 'https://a\tb@github.com/caseydyer8/roastlogs-ops')"
}
p_gh_pages() {
  git -C "$PUB" push -q origin work:refs/heads/gh-pages 2>/dev/null
  fx_clear "$PUB"
}
p_lookalike() { git -C "$PUB" remote add evil 'https://evil.example/github.com/caseydyer8/roastlogs-ops'; }
# Cleared, but with the hook wired up wrongly. Each sets core.hooksPath itself.
p_hp_relative() { fx_clear "$PUB"; git -C "$PUB" config core.hooksPath .githooks; }
p_hp_nomarker() {
  fx_clear "$PUB"
  mkdir -p "$W/nomarker"
  printf '#!/bin/sh\nexit 0\n' > "$W/nomarker/pre-push"
  chmod 755 "$W/nomarker/pre-push"
  git -C "$PUB" config core.hooksPath "$W/nomarker"
}
p_hp_noexec() {
  fx_clear "$PUB"
  mkdir -p "$W/noexec"
  printf '#!/bin/sh\n# roastlogs-push-gate v1\nexit 0\n' > "$W/noexec/pre-push"
  chmod 644 "$W/noexec/pre-push"
  git -C "$PUB" config core.hooksPath "$W/noexec"
}

# --- the installed copy ------------------------------------------------------
# The installer COPIES the hook to <git dir>/push-gate/pre-push, outside every
# work tree, so checking out a branch that has no .githooks/ cannot remove it.
COPY_REL=".git/push-gate/pre-push"
p_installed()    { fx_clear "$PUB"; fx_install; }
p_copy_edited()  { fx_clear "$PUB"; fx_install; printf '# an edit made after install\n' >> "$PUB/$COPY_REL"; }
p_copy_deleted() { fx_clear "$PUB"; fx_install; rm -f "$PUB/$COPY_REL"; }
p_copy_unmarked() { fx_clear "$PUB"; fx_install; printf '#!/bin/sh\nexit 0\n' > "$PUB/$COPY_REL"; chmod 755 "$PUB/$COPY_REL"; }
p_copy_noexec()  { fx_clear "$PUB"; fx_install; chmod 644 "$PUB/$COPY_REL"; }
# Carriage returns added to every line of the copy. The text is the same once CRs are
# removed, but sh does not ignore them (`deny<CR> "..."` is a different command), so
# this copy behaves differently from the committed hook while looking the same.
p_copy_cr_poisoned() {
  fx_clear "$PUB"; fx_install
  crlf_of "$PUB/$COPY_REL" "$W/cr-copy" && cp "$W/cr-copy" "$PUB/$COPY_REL" && chmod 755 "$PUB/$COPY_REL"
}
# Bootstrap: the gate is installed from local main, but origin/main has no hook yet, and
# this worktree is on a branch from before the gate existed.
p_bootstrap_wt() {
  fx_install; fx_worktree
  git -C "$PUB" update-ref refs/remotes/origin/main "$A0"
  fx_clear "$WT"
}
p_bootstrap_wt_tampered() { p_bootstrap_wt; printf '# tampered\n' >> "$PUB/$COPY_REL"; }
# A stub that keeps the marker and the exec bit but does nothing.
p_copy_stub()    { fx_clear "$PUB"; fx_install; printf '#!/bin/sh\n# roastlogs-push-gate v1\nexit 0\n' > "$PUB/$COPY_REL"; chmod 755 "$PUB/$COPY_REL"; }
# The main checkout moves to a branch from before the gate existed, so its work
# tree has no .githooks/. Installs first (the installer needs the file), switches
# after, and clears the new branch's range.
p_main_old_branch() {
  fx_install
  git -C "$PUB" checkout -q -b old "$A0"
  fx_commit "$PUB" old.txt "old branch work"
  fx_clear "$PUB"
}
# A marked, executable pre-push in DIR. The real hook when there is one, so the
# copy is not "stale" against the fixture's own .githooks/pre-push.
mk_gate_dir() { # DIR
  mkdir -p "$1"
  if [ -f "$W/hookdir/pre-push" ]; then cp "$W/hookdir/pre-push" "$1/pre-push"
  else printf '#!/bin/sh\n# roastlogs-push-gate v1\nexit 0\n' > "$1/pre-push"; fi
  chmod 755 "$1/pre-push"
}
# Cleared pushes whose core.hooksPath is spelled the way Git Bash reports it.
p_win_fwd()  { fx_clear "$PUB"; mk_gate_dir "$PUB/C:/Users/case/gate";  git -C "$PUB" config core.hooksPath 'C:/Users/case/gate'; }
p_win_fwd_lower() { fx_clear "$PUB"; mk_gate_dir "$PUB/c:/users/case/gate"; git -C "$PUB" config core.hooksPath 'c:/users/case/gate'; }
p_win_back() { fx_clear "$PUB"; mk_gate_dir "$PUB/C:\\Users\\case\\gate"; git -C "$PUB" config core.hooksPath 'C:\Users\case\gate'; }
# "C:gate" is relative to the current directory on drive C: in Windows, not absolute.
p_win_driverel() { fx_clear "$PUB"; mk_gate_dir "$PUB/C:gate"; git -C "$PUB" config core.hooksPath 'C:gate'; }

# An ALLOW, with or without a note riding along (PreToolUse additionalContext).
# WANT = yes|no; SUBSTR, if given, must appear in the note.
decide_warn() { # TAG NAME PREP CWDKIND COMMAND WANT [SUBSTR]
  local tag="$1" name="$2" prep="$3" cwdk="$4" cmd="$5" want="$6" sub="${7:-}" cwd c
  want_tag "$tag" || return 0
  fx_new; "$prep"
  cwd="$(cwd_of "$cwdk")"; c="$(subst "$cmd")"
  guard_run "$(guard_json "$cwd" "$c")"
  if [ "$G_DECISION" != allow ]; then
    record "$tag" "$name" FAIL "expected the guard to allow, got $G_DECISION ${G_REASON:+($(printf '%s' "$G_REASON" | cut -c1-110))}"
  elif [ "$want" = yes ] && [ -z "$G_WARN" ]; then
    record "$tag" "$name" FAIL "the guard allowed but carried no warning"
  elif [ "$want" = yes ] && [ -n "$sub" ] && ! printf '%s' "$G_WARN" | grep -qF "$sub"; then
    record "$tag" "$name" FAIL "the warning does not say '$sub': $(printf '%s' "$G_WARN" | cut -c1-120)"
  elif [ "$want" = no ] && [ -n "$G_WARN" ]; then
    record "$tag" "$name" FAIL "an unexpected warning: $(printf '%s' "$G_WARN" | cut -c1-120)"
  else
    record "$tag" "$name" PASS "guard: allow, warning: $want"
  fi
}

subst() {
  local s="$1"
  s="${s//@PUB@/$PUB}"; s="${s//@OPS@/$OPS}"; s="${s//@BARE@/$BARE}"
  s="${s//@WT@/$WT}"; s="${s//@OPSURL@/$OPSURL}"; s="${s//@UNH@/$UNH}"
  s="${s//@CFG@/$CFG}"; s="${s//@FAKESSH@/$FAKESSH}"; s="${s//@FX@/$FX}"
  printf '%s' "$s"
}

cwd_of() {
  case "$1" in
    PUB) printf '%s' "$PUB" ;; OPS) printf '%s' "$OPS" ;; WT) printf '%s' "$WT" ;;
    *) die "bad cwd kind '$1'" ;;
  esac
}

# --- running things the way Claude Code would --------------------------------
assert_in_scratch() { # never let a probe command run against anything real
  local top
  top="$(git -C "$1" rev-parse --show-toplevel 2>/dev/null)"
  # Normalised on both sides: Git for Windows prints C:/Users/..., our scratch path
  # comes from `pwd -P` (/tmp/... or /c/...).
  if [ -z "$top" ] || ! under_scratch "$top"; then
    die "ABORT: probe cwd '$1' resolves to '${top:-no repository}', outside the scratch area. Nothing was run."
  fi
}

guard_json() { # CWD COMMAND
  CWD_="$1" CMD_="$2" python3 -c 'import json,os;print(json.dumps({"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":os.environ["CWD_"],"tool_input":{"command":os.environ["CMD_"]}}))'
}

G_DECISION="" G_REASON="" G_WARN=""
# Runs the guard with the fixture as its working directory (that is where the
# relative "drive-letter" hooks paths of the WIN probes live). G_WARN is the
# guard's additionalContext: a note that rides along with an allow and decides
# nothing (an allow with no decision at all is what Claude Code treats as "carry on").
guard_run() { # JSON (stdin text) -> G_DECISION allow|deny|crash, G_REASON, G_WARN
  local out parsed rc
  G_WARN=""
  out="$(printf '%s' "$1" | (cd "$PUB" && CLAUDE_PROJECT_DIR="$PUB" bash "$GUARD") 2>/dev/null)"; rc=$?
  # The guard exits 0 on every path, allow or deny. A non-zero exit is a crash (a
  # syntax error in an edit, say) and its empty output must never read as "allow".
  if [ "$rc" -ne 0 ]; then
    G_DECISION=crash; G_REASON="the guard itself exited $rc"
    return
  fi
  if [ -z "$out" ]; then
    G_DECISION=allow; G_REASON=""
    return
  fi
  # Line 1 = the decision, line 2 = the reason, line 3 = the added context.
  parsed="$(printf '%s' "$out" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)["hookSpecificOutput"]
    print(d.get("permissionDecision", "none"))
    print(d.get("permissionDecisionReason", "").replace("\n", " "))
    print(d.get("additionalContext", "").replace("\n", " "))
except Exception:
    print("unparsed")')"
  G_DECISION="$(printf '%s\n' "$parsed" | sed -n 1p)"
  G_REASON="$(printf '%s\n' "$parsed" | sed -n 2p)"
  G_WARN="$(printf '%s\n' "$parsed" | sed -n 3p)"
  case "$G_DECISION" in
    allow|deny) ;;
    none) [ -n "$G_WARN" ] && G_DECISION=allow || G_DECISION=weird ;;
    *) G_DECISION=weird ;;
  esac
}

RC="" OUT=""
run_cmd() { # CWD COMMAND -> RC, OUT. `wait` so a trailing & finishes before we look.
  assert_in_scratch "$1"
  OUT="$(cd "$1" && CLAUDE_PROJECT_DIR="$PUB" bash -c "$2"$'\n''__rc=$?; wait; exit $__rc' 2>&1 </dev/null)"
  RC=$?
}

via_guard() { # CWD COMMAND
  guard_run "$(guard_json "$1" "$2")"
  RC=""; OUT=""
  if [ "$G_DECISION" = allow ]; then run_cmd "$1" "$2"; fi
}

# Several tool calls in a row, as Claude makes them: "cmd1 @@SEQ@@ cmd2". Each is judged
# by the guard ON ITS OWN, with the state the earlier ones left behind, and the sequence
# stops at the first refusal (the later calls would not happen).
SEQ='@@SEQ@@'
via_guard_seq() { # CWD "cmd1 @@SEQ@@ cmd2 ..."
  local cwd="$1" rest="$2" one
  RC=""; OUT=""; G_DECISION=allow
  while :; do
    case "$rest" in
      *"$SEQ"*) one="${rest%%"$SEQ"*}"; rest="${rest#*"$SEQ"}" ;;
      *) one="$rest"; rest="" ;;
    esac
    via_guard "$cwd" "$one"
    [ "$G_DECISION" = allow ] || return 0
    [ -n "$rest" ] || return 0
  done
}
run_cmd_seq() { # CWD "cmd1 @@SEQ@@ cmd2 ..." with no guard at all
  local cwd="$1" rest="$2" one
  RC=""; OUT=""
  while :; do
    case "$rest" in
      *"$SEQ"*) one="${rest%%"$SEQ"*}"; rest="${rest#*"$SEQ"}" ;;
      *) one="$rest"; rest="" ;;
    esac
    run_cmd "$cwd" "$one"
    [ -n "$rest" ] || return 0
  done
}

bare_objects() { # commits and tag objects in the bare remote (a tag object carries a message)
  git -C "$BARE" cat-file --batch-all-objects --batch-check='%(objecttype) %(objectname)' 2>/dev/null \
    | awk '$1=="commit" || $1=="tag" {print $2}'
}

leaks() { # objects in the bare remote that are not in $ALLOWED
  local c
  for c in $(bare_objects); do
    case " $ALLOWED " in *" $c "*) ;; *) echo "$c" ;; esac
  done
}

refs_snapshot() { git -C "$BARE" for-each-ref --format='%(refname) %(objectname)'; }
# The first ref line that differs from snapshot $1 in EITHER direction: added, moved or
# deleted (a deleted branch publishes nothing new, but it is a change to the remote).
refs_diff() { # SNAPSHOT
  local now
  now="$(refs_snapshot)"
  { printf '%s\n' "$now" | grep -vxF "$1"; printf '%s\n' "$1" | grep -vxF "$now"; } | head -1
}

blocked_by() { # who stopped it: the text guard, or git / the hook
  if [ "$G_DECISION" = deny ]; then
    printf 'guard: %s' "$(printf '%s' "$G_REASON" | cut -c1-70)"
  elif printf '%s' "$OUT" | grep -q 'push gate: BLOCKED'; then
    printf 'git hook: %s' "$(printf '%s' "$OUT" | grep -m1 'push gate: BLOCKED' | cut -c1-90)"
  elif [ -n "$RC" ] && [ "$RC" != 0 ]; then
    printf 'git, rc=%s: %s' "$RC" "$(printf '%s' "$OUT" | tail -1 | cut -c1-90)"
  else
    printf 'nothing stopped it'
  fi
}

# A leak probe: the command publishes something that was never cleared if
# nothing stops it. Blocked means BOTH that no uncleared commit or tag object
# reached the bare remote AND that its refs are exactly as they were.
# CTL says what the control keeps in place: "nohook" = no gate at all,
# "hook" = the git hook is installed but the command is out to switch it off.
# NOINST=1 (use leak_u) runs the guarded half in a clone the installer has NOT run
# in: only the text guard stands between the command and the remote.
leak() { # TAG NAME PREP CWDKIND CTL COMMAND
  local tag="$1" name="$2" prep="$3" cwdk="$4" ctl="$5" cmd="$6" c cwd R0 L LR CL CR how
  want_tag "$tag" || return 0
  fx_new; "$prep"
  [ "${NOINST:-0}" = 1 ] || fx_install
  cwd="$(cwd_of "$cwdk")"; c="$(subst "$cmd")"
  R0="$(refs_snapshot)"
  via_guard_seq "$cwd" "$c"
  L="$(leaks | head -1)"
  LR="$(refs_diff "$R0")"
  how="$(blocked_by)"
  fx_new; "$prep"
  [ "$ctl" = hook ] && fx_install
  cwd="$(cwd_of "$cwdk")"; c="$(subst "$cmd")"
  R0="$(refs_snapshot)"
  run_cmd_seq "$cwd" "$c"
  CL="$(leaks | head -1)"
  CR="$(refs_diff "$R0")"
  if [ -z "$CL" ] && [ -z "$CR" ]; then
    record "$tag" "$name" FAIL "vacuous probe: with no text guard the command published nothing either ($(printf '%s' "$OUT" | tail -1 | cut -c1-120))"
  elif [ -n "$L" ]; then
    record "$tag" "$name" FAIL "uncleared commit $L reached the bare remote ($how)"
  elif [ -n "$LR" ]; then
    record "$tag" "$name" FAIL "the bare remote's refs changed: ${LR} ($how)"
  else
    record "$tag" "$name" PASS "$how"
  fi
}

leak_u() { NOINST=1 leak "$@"; }

# A decision probe: ask the guard, run nothing. REASON, if given, must appear in
# the guard's stated reason (so a deny for the wrong cause does not count).
decide() { # TAG NAME EXPECT PREP CWDKIND COMMAND [INSTALL=1] [REASON]
  local tag="$1" name="$2" want="$3" prep="$4" cwdk="$5" cmd="$6" inst="${7:-1}" reason="${8:-}" cwd c
  want_tag "$tag" || return 0
  fx_new; "$prep"
  [ "$inst" = 1 ] && fx_install
  cwd="$(cwd_of "$cwdk")"; c="$(subst "$cmd")"
  guard_run "$(guard_json "$cwd" "$c")"
  if [ "$G_DECISION" != "$want" ]; then
    record "$tag" "$name" FAIL "expected guard $want, got $G_DECISION ${G_REASON:+($(printf '%s' "$G_REASON" | cut -c1-110))}"
  elif [ -n "$reason" ] && ! printf '%s' "$G_REASON" | grep -qF "$reason"; then
    record "$tag" "$name" FAIL "guard denied, but not for the stated reason (wanted '$reason' in: $(printf '%s' "$G_REASON" | cut -c1-110))"
  else
    record "$tag" "$name" PASS "guard: $G_DECISION"
  fi
}

decide_json() { # TAG NAME EXPECT RAWJSON
  want_tag "$1" || return 0
  fx_new; p_plain; fx_install
  guard_run "$4"
  if [ "$G_DECISION" = "$3" ]; then record "$1" "$2" PASS "guard: $G_DECISION"
  else record "$1" "$2" FAIL "expected guard $3, got $G_DECISION"; fi
}

check() { # TAG NAME CONDITION-EXIT-STATUS DETAIL-IF-FAIL
  if [ "$3" -eq 0 ]; then record "$1" "$2" PASS ""; else record "$1" "$2" FAIL "$4"; fi
}

echo "push-gate harness: $LABEL"
echo "scratch: $W"

# =============================================================================
# Leak probes. State "cleared" = HEAD is work, and /publish-review has cleared
# exactly its range. S (secret) and the v-secret tag were never reviewed.
# =============================================================================

# RL-031: the range was cleared BEFORE the commit that the same command adds.
leak RL-031 commit-then-push-new-branch  p_cleared PUB nohook 'git commit -q --allow-empty -m next && git push origin HEAD'
leak RL-031 commit-then-push-existing    p_existing PUB nohook 'git commit -q --allow-empty -m next && git push origin work'

# RL-032: the text guard judges HEAD; git pushes whatever the refspec says.
leak RL-032 refspec-secret-to-main       p_cleared PUB nohook 'git push origin secret:main'
leak RL-032 push-all                     p_cleared PUB nohook 'git push --all origin'
leak RL-032 push-tags                    p_cleared PUB nohook 'git push --tags origin'
leak RL-032 push-mirror                  p_cleared PUB nohook 'git push --mirror origin'
leak RL-032 push-two-branches            p_cleared PUB nohook 'git push origin work secret'
leak RL-032 two-branches-cleared-one-last p_cleared PUB nohook 'git push origin secret work'
leak RL-032 glob-refspec                 p_cleared PUB nohook 'git push origin "refs/heads/*:refs/heads/*"'
# Not an uncleared commit, but not a reviewed shape either: a tag, an annotated
# tag whose message nobody read, and a non-branch ref, all on the cleared commit.
leak RL-032 lightweight-tag              p_tagged PUB nohook 'git push origin v-cleared'
leak RL-032 annotated-tag-with-message   p_tagged PUB nohook 'git push origin v-note'
leak RL-032 cleared-commit-to-a-notes-ref p_cleared PUB nohook 'git push origin work:refs/notes/review'

# RL-033: the text guard resolves the repo from the cwd; git obeys GIT_DIR.
leak RL-033 GIT_DIR-from-ops-cwd         p_forged_ops OPS nohook 'GIT_DIR=@PUB@/.git git push origin secret:main'
leak RL-033 GIT_DIR-from-nested-ops-clone p_nested_ops OPS nohook 'GIT_DIR=@PUB@/.git git push origin secret:main'
leak RL-033 git-dir-flag-from-ops-cwd    p_forged_ops OPS nohook 'git --git-dir=@PUB@/.git push origin secret:main'
leak RL-033 git-dir-and-work-tree        p_forged_ops OPS nohook 'git --git-dir @PUB@/.git --work-tree @PUB@ push origin secret:main'
# The hook runs only in a repo whose config names it, so pointing git at ANY other
# clone (here: one the gate was never installed in) escapes it. Only the TEXT of the
# command can stop these, and they are refused wherever they start from.
leak RL-033 GIT_DIR-at-an-unhooked-clone-from-ops-cwd        p_unh_ops     OPS nohook 'GIT_DIR=@UNH@/.git git push origin secret:main'
leak RL-033 git-dir-flag-at-an-unhooked-clone-from-ops-cwd   p_unh_ops     OPS nohook 'git --git-dir=@UNH@/.git push origin secret:main'
leak RL-033 git-dir-at-an-unhooked-clone-from-a-cleared-clone p_unh_cleared PUB nohook 'git --git-dir=@UNH@/.git push origin secret:main'
leak RL-033 exported-GIT_DIR-from-a-cleared-clone            p_unh_cleared PUB nohook 'export GIT_DIR=@UNH@/.git; git push origin secret:main'
leak RL-033 env-GIT_DIR-from-a-cleared-clone                 p_unh_cleared PUB nohook 'env GIT_DIR=@UNH@/.git git push origin secret:main'
leak RL-033 cd-into-an-unhooked-clone-in-a-subshell          p_unh_cleared PUB nohook '(cd @UNH@; git push origin secret:main)'
leak RL-033 cd-into-an-unhooked-clone-in-bash-c              p_unh_cleared PUB nohook "bash -c 'cd @UNH@ && git push origin secret:main'"
leak RL-033 cd-into-an-unhooked-clone-in-a-group             p_unh_cleared PUB nohook '{ cd @UNH@; git push origin secret:main; }'
if [ "$HAVE_ENV_C" = 1 ]; then
  leak RL-033 env-dash-C-into-an-unhooked-clone              p_unh_cleared PUB nohook 'env -C @UNH@ git push origin secret:main'
else
  want_tag RL-033 && record RL-033 env-dash-C-into-an-unhooked-clone SKIP "env -C is GNU-only and this machine's env lacks it"
fi
# Not wrapped, so these were already refused (no hook is installed THERE): kept so
# that stays true.
leak RL-033 plain-cd-into-an-unhooked-clone                  p_unh_cleared PUB nohook 'cd @UNH@ && git push origin secret:main'
leak RL-033 plain-dash-C-into-an-unhooked-clone              p_unh_cleared PUB nohook 'git -C @UNH@ push origin secret:main'
# git -c can re-point the push URL of a remote. From the ops clone (no hook, ops
# origin) that publishes the PRIVATE repo's branch to the public remote.
leak RL-033 pushurl-override-from-ops-cwd                    p_plain       OPS nohook 'git -c remote.origin.pushurl=@BARE@ push origin main:leak'
# The ops clone can never have the hook (the installer needs a .githooks/ there), so
# the exemption it gets is decided by TEXT, and it is only as good as that text. Each
# of these is TWO tool calls ("@@SEQ@@"), every step allowed by itself: first make the
# literal ops URL point somewhere public, then push to it.
leak RL-033 remote-named-like-the-ops-url-then-push p_ops_branch OPS nohook "git config 'remote.@OPSURL@.url' @BARE@ @@SEQ@@ git push '@OPSURL@' leakbr:leak"
leak RL-033 insteadOf-rewrites-the-ops-url-then-push p_ops_branch OPS nohook "git config 'url.@BARE@.insteadOf' '@OPSURL@' @@SEQ@@ git push '@OPSURL@' leakbr:leak"
leak RL-033 push-default-then-the-repo-flag          p_ops_branch OPS nohook 'git config push.default current @@SEQ@@ git push --repo=@BARE@'
# More ways to the same place, found after the first three were closed:
#  (i) a remote NAMED like the URL that has only a pushurl, (ii) config FILES that git
#  reads from the environment (the guard resolves URLs in its own environment),
#  (iii) a transport override that sends the push elsewhere while the URL still reads as ops.
leak RL-033 pushurl-only-remote-named-like-the-ops-url p_ops_branch OPS nohook "git config 'remote.@OPSURL@.pushurl' @BARE@ @@SEQ@@ git push '@OPSURL@' leakbr:leak"
leak RL-033 config-file-env-var-rewrites-the-ops-url p_ops_cfg OPS nohook 'GIT_CONFIG_GLOBAL=@CFG@ git push origin leakbr:leak'
leak RL-033 core-sshCommand-redirects-an-ops-push    p_ops_ssh OPS nohook "git config core.sshCommand @FAKESSH@ @@SEQ@@ GIT_ALLOW_PROTOCOL=file:ssh git push origin leakbr:leak"
leak RL-033 GIT_SSH_COMMAND-redirects-an-ops-push    p_ops_ssh OPS nohook 'GIT_ALLOW_PROTOCOL=file:ssh GIT_SSH_COMMAND=@FAKESSH@ git push origin leakbr:leak'
decide RL-033 GIT_CONFIG_GLOBAL-on-a-push-denies     deny p_ops_cfg OPS 'GIT_CONFIG_GLOBAL=@CFG@ git push origin leakbr:leak' 1 'GIT_CONFIG_GLOBAL'
decide RL-033 GIT_CONFIG_SYSTEM-on-a-push-denies     deny p_ops_cfg OPS 'GIT_CONFIG_SYSTEM=@CFG@ git push origin leakbr:leak' 1 'GIT_CONFIG_GLOBAL'
decide RL-033 HOME-on-a-push-denies                  deny p_ops_cfg OPS 'HOME=@FX@ git push origin leakbr:leak' 1 'HOME'
decide RL-033 XDG_CONFIG_HOME-on-a-push-denies       deny p_ops_cfg OPS 'XDG_CONFIG_HOME=@FX@ git push origin leakbr:leak' 1 'XDG_CONFIG_HOME'
decide RL-033 exported-HOME-then-push-denies         deny p_ops_cfg OPS 'export HOME=@FX@; git push origin leakbr:leak' 1 'HOME'
decide RL-033 GIT_SSH-on-a-push-denies               deny p_ops_ssh OPS 'GIT_SSH=@FAKESSH@ git push origin leakbr:leak' 1 'transport override'
decide RL-033 GIT_PROXY_COMMAND-on-a-push-denies     deny p_ops_ssh OPS 'GIT_PROXY_COMMAND=@FAKESSH@ git push origin leakbr:leak' 1 'transport override'
decide RL-033 core-gitProxy-denies                   deny p_ops_ssh OPS 'git config core.gitProxy @FAKESSH@' 1 'transport override'
decide RL-033 dash-c-core-sshCommand-denies          deny p_ops_ssh OPS 'git -c core.sshCommand=@FAKESSH@ push origin leakbr:leak' 1 'transport override'
decide RL-033 home-assignment-without-a-push-allows  allow p_plain PUB 'HOME=@FX@ git status'
decide RL-033 dollar-home-with-a-push-allows         allow p_cleared PUB 'echo $HOME && git push origin work'
# --repo and its abbreviations (git takes any unique prefix: --rep, --repo), from the ops cwd.
leak RL-033 repo-abbreviation-then-push p_ops_branch OPS nohook 'git config push.default current @@SEQ@@ git push --rep=@BARE@'
leak RL-033 repo-abbreviation-by-path-then-push p_ops_branch OPS nohook 'git config push.default current @@SEQ@@ /usr/bin/git push --rep=@BARE@'
decide RL-033 rep-abbreviation-denies        deny p_ops_branch OPS 'git push --rep=@BARE@' 1 'git push --repo'
decide RL-033 rep-separate-value-denies      deny p_ops_branch OPS 'git push --rep @BARE@' 1 'git push --repo'
decide RL-033 repo-separate-value-denies     deny p_ops_branch OPS 'git push --repo @BARE@' 1 'git push --repo'
decide RL-033 repo-by-path-git-denies        deny p_ops_branch OPS '/usr/bin/git push --rep=@BARE@' 1 'git push --repo'
decide RL-033 repo-after-the-refspec-denies  deny p_ops_branch OPS 'git push origin leakbr --repo=@BARE@' 1 'git push --repo'
# ... but gh takes --repo too and a message may say "push": those are not git pushes.
decide G gh-run-list-repo-event-push-allows   allow p_plain PUB 'gh run list --repo caseydyer8/roastlogs --event push'
decide G gh-pr-list-repo-search-push-allows   allow p_plain PUB 'gh pr list --repo caseydyer8/roastlogs --search "push"'
decide G gh-pr-create-repo-title-push-allows  allow p_plain PUB 'gh pr create --repo caseydyer8/roastlogs --title "Add push gate" --body-file f'
decide G gh-issue-create-repo-title-push-allows allow p_plain PUB 'gh issue create --repo caseydyer8/roastlogs --title "push notifications"'
decide RL-033 second-pushurl-is-public-denies        deny p_ops_multi   OPS 'git push origin main'
decide RL-033 ops-url-with-a-newline-denies          deny p_ops_newline OPS 'git push origin main'
decide RL-033 ops-url-repeated-on-two-lines-denies  deny p_ops_newline_twice OPS 'git push origin main'
decide RL-033 ops-url-with-a-control-character-denies deny p_ops_ctrl_userinfo OPS 'git push origin main'
decide RL-033 repo-flag-denies                       deny p_ops_branch  OPS 'git push --repo=@BARE@' 1 'git push --repo'
# ... and the genuine ops pushes still go through.
decide L ops-push-by-literal-url-allows              allow p_plain PUB 'git push @OPSURL@ main'
decide L ops-push-by-dash-C-still-allows             allow p_plain PUB 'git -C @OPS@ push origin main'

# RL-034: the value of -o looks like the remote, and the remote looks like ops.
leak RL-034 push-option-short            p_secret_head PUB nohook 'git push -o @OPSURL@ origin HEAD'
leak RL-034 push-option-long             p_secret_head PUB nohook 'git push --push-option @OPSURL@ origin HEAD'
# The same, in a clone the installer has NOT run in: the value of -o was read as
# the remote, looked like ops, and the whole push was exempted before the
# "no hook installed" check ever ran.
leak_u RL-034 push-option-short-uninstalled   p_secret_head PUB nohook 'git push -o @OPSURL@ origin HEAD'
leak_u RL-034 push-option-long-uninstalled    p_secret_head PUB nohook 'git push --push-option @OPSURL@ origin HEAD'

# RL-035: the text guard only sees a push when `git` is the first word.
leak RL-035 bash-c                       p_cleared PUB nohook "bash -c 'git push origin secret:main'"
leak RL-035 sh-c                         p_cleared PUB nohook 'sh -c "git push origin secret:main"'
leak RL-035 subshell                     p_cleared PUB nohook '( git push origin secret:main )'
leak RL-035 env                          p_cleared PUB nohook 'env git push origin secret:main'
leak RL-035 command                      p_cleared PUB nohook 'command git push origin secret:main'
leak RL-035 time                         p_cleared PUB nohook 'time git push origin secret:main'
leak RL-035 command-substitution         p_cleared PUB nohook 'echo $(git push origin secret:main)'
leak RL-035 xargs                        p_cleared PUB nohook "printf 'origin\nsecret:main\n' | xargs git push"
leak RL-035 backgrounded-after-other     p_cleared PUB nohook 'sleep 0 & git push origin secret:main'
leak RL-035 trailing-ampersand           p_cleared PUB nohook 'git push origin secret:main &'
leak RL-035 repo-alias                   p_cleared PUB nohook 'git pp origin secret:main'
leak RL-035 inline-alias                 p_cleared PUB nohook 'git -c alias.zz=push zz origin secret:main'
leak RL-035 eval                         p_cleared PUB nohook 'eval "git push origin secret:main"'
leak RL-035 backticks                    p_cleared PUB nohook 'echo `git push origin secret:main`'
leak RL-035 group                        p_cleared PUB nohook '{ git push origin secret:main; }'
leak RL-035 nohup                        p_cleared PUB nohook 'nohup git push origin secret:main'
need timeout RL-035 timeout && leak RL-035 timeout p_cleared PUB nohook 'timeout 30 git push origin secret:main'
# Wrapped pushes in a clone the installer has NOT run in. The text guard used to see
# only a `git` that is the first word, so none of these was even recognised as a push.
leak_u RL-035 uninstalled-bash-c         p_cleared PUB nohook "bash -c 'git push origin secret:main'"
leak_u RL-035 uninstalled-sh-c           p_cleared PUB nohook 'sh -c "git push origin secret:main"'
leak_u RL-035 uninstalled-subshell       p_cleared PUB nohook '( git push origin secret:main )'
leak_u RL-035 uninstalled-group          p_cleared PUB nohook '{ git push origin secret:main; }'
leak_u RL-035 uninstalled-env            p_cleared PUB nohook 'env git push origin secret:main'
leak_u RL-035 uninstalled-command        p_cleared PUB nohook 'command git push origin secret:main'
leak_u RL-035 uninstalled-time           p_cleared PUB nohook 'time git push origin secret:main'
leak_u RL-035 uninstalled-nohup          p_cleared PUB nohook 'nohup git push origin secret:main'
need timeout RL-035 uninstalled-timeout && leak_u RL-035 uninstalled-timeout p_cleared PUB nohook 'timeout 30 git push origin secret:main'
leak_u RL-035 uninstalled-eval           p_cleared PUB nohook 'eval "git push origin secret:main"'
leak_u RL-035 uninstalled-xargs          p_cleared PUB nohook "printf 'origin\nsecret:main\n' | xargs git push"
leak_u RL-035 uninstalled-substitution   p_cleared PUB nohook 'echo $(git push origin secret:main)'
leak_u RL-035 uninstalled-backticks      p_cleared PUB nohook 'echo `git push origin secret:main`'
leak_u RL-033 uninstalled-GIT_DIR-from-ops-cwd p_unh_ops OPS nohook 'GIT_DIR=@UNH@/.git git push origin secret:main'
# Shell syntax that puts something other than `git` first in the segment. Each reached
# the remote with no clearance at all where the hook was not installed.
for form in \
  'if-then|if true; then git push origin secret:main; fi' \
  'for-do|for b in secret; do git push origin $b:main; done' \
  'while-do|while true; do git push origin secret:main; break; done' \
  'until-do|until false; do git push origin secret:main; break; done' \
  'case-arm|case x in x) git push origin secret:main;; esac' \
  'bang|true && ! git push origin secret:main' \
  'else-branch|if false; then true; else git push origin secret:main; fi' \
  'single-ampersand|git status & git push origin secret:main' \
  'absolute-path-env|/usr/bin/env git push origin secret:main' \
  'nice|nice git push origin secret:main' \
  'bash-login-c|bash --login -c "git push origin secret:main"' \
  'bash-noprofile-c|bash --noprofile -c "git push origin secret:main"' \
  'bash-o-pipefail-c|bash -o pipefail -c "git push origin secret:main"' \
  'find-exec|find . -maxdepth 0 -exec git push origin secret:main \;'; do
  nm="${form%%|*}"; cm="${form#*|}"
  leak_u RL-035 "uninstalled-$nm" p_cleared PUB nohook "$cm"
  leak    RL-035 "installed-$nm"   p_cleared PUB nohook "$cm"
done
need setsid RL-035 uninstalled-setsid && leak_u RL-035 uninstalled-setsid p_cleared PUB nohook 'setsid -w git push origin secret:main'
need stdbuf RL-035 uninstalled-stdbuf && leak_u RL-035 uninstalled-stdbuf p_cleared PUB nohook 'stdbuf -oL git push origin secret:main'
need flock  RL-035 uninstalled-flock  && leak_u RL-035 uninstalled-flock  p_cleared PUB nohook 'flock /tmp/pgate-flock.lock git push origin secret:main'

# HD: ways to switch the git hook itself off. Control = the hook IS installed.
leak HD no-verify                        p_cleared PUB hook 'git push --no-verify origin secret:main'
leak HD no-verify-abbreviated            p_cleared PUB hook 'git push --no-veri origin secret:main'
leak HD hooks-path-flag-in-wrapper       p_cleared PUB hook "bash -c 'git -c core.hooksPath=/dev/null push origin secret:main'"
leak HD hooks-path-flag-split-by-quotes  p_cleared PUB hook "bash -c 'git -c core.hooks\"\"Path=/dev/null push origin secret:main'"
leak HD config-env-count                 p_cleared PUB hook 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git push origin secret:main'
leak HD config-env-parameters            p_cleared PUB hook "GIT_CONFIG_PARAMETERS=\"'core.hookspath'='/dev/null'\" git push origin secret:main"
leak HD send-pack                        p_cleared PUB hook "bash -c 'git send-pack @BARE@ secret:refs/heads/main'"
leak HD unset-then-push                  p_cleared PUB hook 'git config --unset core.hooksPath && git push origin secret:main'
# Removing or renaming the whole [core] section drops core.hooksPath without ever
# naming it, and the repository still works afterwards.
leak HD remove-core-section-then-push    p_cleared PUB hook 'git config --remove-section core && git push origin secret:main'
leak HD rename-core-section-then-push    p_cleared PUB hook 'git config --rename-section core corx && git push origin secret:main'
leak HD remove-core-section-quoted       p_cleared PUB hook "git config --remove-section 'core' && git push origin secret:main"
# Cheap one-liners that defeat the INSTALLED state: rewrite the copy in the same command
# that pushes (the guard checks it BEFORE the command runs), strip hooksPath from the
# config without naming core., put it in the per-worktree config, move the ref the hook
# measures from. The guard refuses write-ish commands that touch those files and refs.
leak HD copy-swapped-in-the-same-command p_cleared PUB hook "printf '#!/bin/sh\n# roastlogs-push-gate v1\nexit 0\n' > .git/push-gate/pre-push && git push origin secret:main"
leak HD config-edited-with-sed-then-alias-push p_cleared PUB hook "sed -i.bak '/hooksPath/d' .git/config && git config alias.zz push && git zz origin secret:main"
leak HD per-worktree-config-sets-hooks-path p_cleared PUB hook "git config extensions.worktreeConfig true && printf '[core]\n\thooksPath = /dev/null\n' > .git/config.worktree && git push origin secret:main"
leak HD update-ref-moves-origin-main-then-pushes p_cleared PUB hook 'git update-ref refs/remotes/origin/main $(git rev-parse secret) && git push origin secret:brandnew'
leak HD copy-removed-then-pushed       p_cleared PUB hook 'rm -rf .git/push-gate && git push origin secret:main'
# Deletes: the hook (Case's terminal) lets them through, but the GUARD (Claude) does not.
leak RL-032 delete-with-the-delete-flag p_gh_pages PUB hook 'git push origin --delete gh-pages'
leak RL-032 delete-with-a-colon-refspec p_gh_pages PUB hook 'git push origin :gh-pages'
leak RL-032 delete-with-dash-d          p_gh_pages PUB hook 'git push -d origin gh-pages'
leak RL-032 delete-with-a-forced-colon-refspec p_gh_pages PUB hook 'git push origin +:gh-pages'
# The hook-skip flag is refused in ANY command, including through an alias (the fixture
# defines alias.pp = push).
leak HD alias-no-verify                  p_cleared PUB hook 'git pp --no-verify origin secret:main'
leak HD alias-no-verify-abbreviated      p_cleared PUB hook 'git pp --no-veri origin secret:main'
leak HD alias-no-verify-in-a-wrapper     p_cleared PUB hook "bash -c 'git pp --no-verify origin secret:main'"

# =============================================================================
# Guard decisions: what the text guard itself must say. Nothing is run.
# =============================================================================
P='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{'
decide_json G command-not-a-string-denies  deny  "${P}\"command\":123}}"
decide_json G command-is-a-list-denies     deny  "${P}\"command\":[\"git\",\"push\"]}}"
decide_json L garbled-json-denies          deny  '{not json'
decide_json L mcp-write-denies             deny  '{"tool_name":"mcp__github__push_files","tool_input":{}}'
decide_json L mcp-read-allows              allow '{"tool_name":"mcp__github__get_file_contents","tool_input":{}}'
decide G read-the-hooks-path-allows        allow p_plain PUB 'git config --get core.hooksPath'
decide G read-the-hooks-path-with-C-allows allow p_plain OPS 'git -C @PUB@ config --get core.hooksPath'
decide G read-the-hooks-path-with-fallback allow p_plain PUB 'git config --get core.hooksPath || echo unset'
decide G read-then-write-the-hooks-path-denies deny p_plain PUB 'git config --get core.hooksPath; git config core.hooksPath x'
decide G hooks-path-in-a-substitution-denies deny p_plain PUB 'echo $(git config core.hooksPath /dev/null)'
decide G write-the-hooks-path-denies       deny  p_plain PUB 'git config core.hooksPath /dev/null'
decide G unset-the-hooks-path-denies       deny  p_plain PUB 'git config --unset core.hooksPath'
decide G hooks-path-read-then-write-denies deny  p_plain PUB 'git config --get core.hooksPath && git config core.hooksPath x'
decide G grep-for-hooksPath-allows         allow p_plain PUB 'grep -rn hooksPath .claude'
decide G commit-allows                     allow p_cleared PUB 'git commit -m fix'
# The hook-skip flag is refused in ANY command Claude runs. Nothing legitimate is
# lost: with core.hooksPath on the installed copy there is no pre-commit or
# commit-msg hook for `git commit --no-verify` to skip.
decide G no-verify-on-a-commit-denies      deny  p_plain PUB 'git commit --no-verify -m wip' 1 'hook-skip flag'
decide G no-verify-abbreviated-denies      deny  p_plain PUB 'git commit --no-veri -m wip' 1 'hook-skip flag'
decide G no-verify-through-an-alias-denies deny  p_cleared PUB 'git pp --no-verify origin work' 1 'hook-skip flag'
decide G no-verify-with-a-value-denies     deny  p_plain PUB 'git commit --no-verify=x -m wip' 1 'hook-skip flag'
# --no-verify-signatures is a different option (merge, pull), not a hook skip: a
# substring test refused it, and Claude then has a reason to work around the guard.
decide G no-verify-signatures-on-a-merge-allows allow p_plain PUB 'git merge --no-verify-signatures origin/main'
decide G no-verify-signatures-on-a-pull-allows  allow p_plain PUB 'git pull --no-verify-signatures'
# The deny text must offer BOTH ways round a false positive (a message that merely
# names the words): a message file for git commit, and --body-file for a PR body.
decide G false-positive-deny-offers-commit-F  deny p_plain PUB 'git commit -m "explain --no-verify"' 1 'git commit -F'
decide G false-positive-deny-offers-body-file deny p_plain PUB 'git commit -m "explain --no-verify"' 1 'gh pr create --body-file'
# `git push -n` is --dry-run, NOT a hook skip (the hook still runs under it), so
# it is not refused; the T probes below show a dry run is still gated.
decide G dash-n-on-push-is-a-dry-run-allows allow p_cleared PUB 'git push -n origin work'
# The documented way to commit a message that names the guarded words.
decide G commit-with-a-message-file-allows allow p_plain PUB 'git commit -F .session/msg.txt'
decide G commit-message-naming-the-flag-denies deny p_plain PUB 'git commit -m "explain --no-verify"' 1 'hook-skip flag'
decide G config-override-on-a-non-push-denies deny p_plain PUB 'git -c core.hooksPath=/dev/null status' 1 'core.hooksPath'
# Running the installer is Case's job, in ANY form (--force accepts shadowing hooks
# in .git/hooks, and even the plain form is not harmless: before it installed only
# the committed hook, it copied the work-tree file, which Claude can weaken and then
# "refresh" the gate from). Reading, diffing and committing the file stay allowed.
decide G installer-force-denies            deny  p_plain PUB 'bash .claude/tools/install-push-gate.sh --force' 1 'install-push-gate.sh'
decide G installer-force-in-a-wrapper-denies deny p_plain PUB "bash -c 'bash .claude/tools/install-push-gate.sh --force'" 1 'install-push-gate.sh'
decide G installer-force-after-cd-denies   deny  p_plain PUB 'cd @PUB@ && ./.claude/tools/install-push-gate.sh --force' 1 'install-push-gate.sh'
decide G installer-with-bash-denies        deny  p_plain PUB 'bash .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-with-sh-denies          deny  p_plain PUB 'sh .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-with-bash-flags-denies  deny  p_plain PUB 'bash -x .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-sourced-denies          deny  p_plain PUB 'source .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-dot-sourced-denies      deny  p_plain PUB '. .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-dot-slash-denies        deny  p_plain PUB './.claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-bare-relative-path-denies deny p_plain PUB '.claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-absolute-path-denies    deny  p_plain PUB '@PUB@/.claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-after-cd-denies         deny  p_plain PUB 'cd @PUB@/.claude/tools && ./install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-exec-denies             deny  p_plain PUB 'exec bash .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-under-env-denies        deny  p_plain PUB 'env FOO=1 bash .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-under-sudo-denies       deny  p_plain PUB 'sudo bash .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-in-bash-c-denies        deny  p_plain PUB "bash -c 'bash .claude/tools/install-push-gate.sh'" 1 'install-push-gate.sh'
decide G installer-in-a-subshell-denies    deny  p_plain PUB '(bash .claude/tools/install-push-gate.sh)' 1 'install-push-gate.sh'
decide G installer-after-a-pipe-denies     deny  p_plain PUB 'echo y | bash .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-add-allows              allow p_plain PUB 'git add .claude/tools/install-push-gate.sh'
decide G installer-diff-allows             allow p_plain PUB 'git diff HEAD -- .claude/tools/install-push-gate.sh'
decide G installer-show-allows             allow p_plain PUB 'git show HEAD:.claude/tools/install-push-gate.sh'
decide G installer-log-allows              allow p_plain PUB 'git log --oneline -- .claude/tools/install-push-gate.sh'
decide G installer-cat-allows              allow p_plain PUB 'cat .claude/tools/install-push-gate.sh'
decide G installer-grep-allows             allow p_plain PUB 'grep -n -- --force .claude/tools/install-push-gate.sh'
decide G installer-shellcheck-allows       allow p_plain PUB 'shellcheck .claude/tools/install-push-gate.sh'
decide G installer-wc-allows               allow p_plain PUB 'wc -l .claude/tools/install-push-gate.sh'
decide G send-pack-denies                  deny  p_plain PUB 'git send-pack @BARE@ main'
decide G config-count-denies               deny  p_plain PUB 'GIT_CONFIG_COUNT=0 git status'
decide G config-key-denies                 deny  p_plain PUB 'export GIT_CONFIG_KEY_0=x'
decide G hook-not-installed-denies         deny  p_cleared PUB 'git push origin work' 0 install-push-gate.sh
# The deny tells Claude to ask Case; it must not tell Claude to run the installer.
decide G hook-not-installed-asks-case      deny  p_cleared PUB 'git push origin work' 0 'Ask Case'
decide G hook-path-relative-denies         deny  p_hp_relative PUB 'git push origin work' 0
decide G hook-without-marker-denies        deny  p_hp_nomarker PUB 'git push origin work' 0
sim_skip G hook-not-executable-denies || decide G hook-not-executable-denies        deny  p_hp_noexec PUB 'git push origin work' 0
decide G hook-installed-and-cleared-allows allow p_cleared PUB 'git push origin work'

# Redirecting git at another repository, or re-pointing a remote, from a push command.
# Installed AND cleared, so a plain push is allowed and only the redirect can be why
# a probe below is refused (the reason is checked).
R='GIT_DIR / --git-dir'
decide G GIT_DIR-assignment-denies         deny  p_cleared PUB 'GIT_DIR=@UNH@/.git git push origin work' 1 "$R"
decide G GIT_WORK_TREE-assignment-denies   deny  p_cleared PUB 'GIT_WORK_TREE=@UNH@ git push origin work' 1 "$R"
decide G GIT_COMMON_DIR-assignment-denies  deny  p_cleared PUB 'GIT_COMMON_DIR=@UNH@/.git git push origin work' 1 "$R"
decide G GIT_OBJECT_DIRECTORY-assignment-denies deny p_cleared PUB 'GIT_OBJECT_DIRECTORY=@UNH@/.git/objects git push origin work' 1 "$R"
decide G exported-GIT_DIR-denies           deny  p_cleared PUB 'export GIT_DIR=@UNH@/.git && git push origin work' 1 "$R"
decide G git-dir-flag-denies               deny  p_cleared PUB 'git --git-dir=@UNH@/.git push origin work' 1 "$R"
decide G git-dir-flag-separate-value-denies deny p_cleared PUB 'git --git-dir @UNH@/.git push origin work' 1 "$R"
decide G work-tree-flag-denies             deny  p_cleared PUB 'git --work-tree=@UNH@ push origin work' 1 "$R"
decide G config-env-flag-denies            deny  p_cleared PUB 'git --config-env=remote.origin.pushurl=URL push origin work' 1 "$R"
decide G dash-c-on-a-push-denies           deny  p_cleared PUB 'git -c remote.origin.pushurl=@BARE@ push origin work' 1 "$R"
decide G dash-c-after-dash-C-denies        deny  p_cleared PUB 'git -C @PUB@ -c remote.origin.pushurl=@BARE@ push origin work' 1 "$R"
decide G dash-c-quoted-denies              deny  p_cleared PUB "git -c 'remote.origin.pushurl=@BARE@' push origin work" 1 "$R"
decide G dash-capital-C-is-not-dash-c-allows allow p_cleared PUB 'git -C @PUB@ push origin work'
decide G dash-capital-C-twice-allows       allow p_cleared PUB 'git -C @PUB@ -C . push origin work'

# Wrapped pushes. The text guard used to see a push only when `git` was the first
# word. Installed and cleared again: a plain push is allowed, so only the wrapper is
# why a probe below is refused.
R='wrapped git push'
decide G wrapped-bash-c-denies             deny  p_cleared PUB "bash -c 'git push origin work'" 1 "$R"
decide G wrapped-bash-lc-denies            deny  p_cleared PUB "bash -lc 'git push origin work'" 1 "$R"
decide G wrapped-sh-c-denies               deny  p_cleared PUB 'sh -c "git push origin work"' 1 "$R"
decide G wrapped-zsh-c-denies              deny  p_cleared PUB "zsh -c 'git push origin work'" 1 "$R"
decide G wrapped-dash-c-denies             deny  p_cleared PUB "dash -c 'git push origin work'" 1 "$R"
decide G wrapped-eval-denies               deny  p_cleared PUB 'eval "git push origin work"' 1 "$R"
decide G wrapped-xargs-denies              deny  p_cleared PUB 'echo origin work | xargs git push' 1 "$R"
decide G wrapped-env-denies                deny  p_cleared PUB 'env git push origin work' 1 "$R"
decide G wrapped-env-with-assignment-denies deny p_cleared PUB 'env FOO=1 git push origin work' 1 "$R"
decide G wrapped-exec-denies               deny  p_cleared PUB 'exec git push origin work' 1 "$R"
decide G wrapped-sudo-denies               deny  p_cleared PUB 'sudo git push origin work' 1 "$R"
decide G wrapped-nohup-denies              deny  p_cleared PUB 'nohup git push origin work' 1 "$R"
decide G wrapped-timeout-denies            deny  p_cleared PUB 'timeout 30 git push origin work' 1 "$R"
decide G wrapped-time-denies               deny  p_cleared PUB 'time git push origin work' 1 "$R"
decide G wrapped-command-denies            deny  p_cleared PUB 'command git push origin work' 1 "$R"
decide G wrapped-subshell-denies           deny  p_cleared PUB '(git push origin work)' 1 "$R"
decide G wrapped-subshell-with-cd-denies   deny  p_cleared PUB '( cd @PUB@ && git push origin work )' 1 "$R"
decide G wrapped-group-denies              deny  p_cleared PUB '{ git push origin work; }' 1 "$R"
decide G wrapped-substitution-denies       deny  p_cleared PUB 'echo $(git push origin work)' 1 "$R"
decide G wrapped-backticks-denies          deny  p_cleared PUB 'echo `git push origin work`' 1 "$R"
decide G wrapped-after-another-command-denies deny p_cleared PUB 'true && ( git push origin work )' 1 "$R"
# The benign corpus: ordinary lines that happen to contain a wrapper word, a
# parenthesis, "env" or "sh" next to a plain push must keep working.
decide G benign-script-then-push-allows    allow p_cleared PUB 'bash x.sh && git push origin work'
decide G benign-add-env-example-then-push-allows allow p_cleared PUB 'git add .env.example && git push origin work'
decide G benign-status-then-push-allows    allow p_cleared PUB 'git status && git push origin work'
decide G benign-echo-then-push-allows      allow p_cleared PUB 'echo done; git push origin work'
decide G benign-echo-time-then-push-allows allow p_cleared PUB 'echo time to push && git push origin work'
decide G benign-fetch-then-push-allows     allow p_cleared PUB 'git fetch --quiet && git push origin work'
decide G benign-push-piped-to-tail-allows  allow p_cleared PUB 'git push origin work 2>&1 | tail -3'
decide G benign-push-of-a-substituted-branch-allows allow p_cleared PUB 'git push origin "$(git rev-parse --abbrev-ref HEAD)"'
decide G benign-push-of-a-backticked-branch-allows allow p_cleared PUB 'git push origin `git rev-parse --abbrev-ref HEAD`'
decide G benign-build-then-push-allows     allow p_cleared PUB 'npm run build && git push origin work'
decide G benign-log-piped-then-push-allows allow p_cleared PUB 'git log --oneline | head -3 && git push origin work'
decide G benign-cd-then-push-allows        allow p_cleared PUB 'cd @PUB@ && git push origin work'
decide G benign-assignment-then-push-allows allow p_cleared PUB 'FOO=1 git push origin work'
decide G benign-push-then-parenthesised-echo-allows allow p_cleared PUB 'git push origin work && echo "(pushed)"'
decide G benign-push-then-env-comment-allows allow p_cleared PUB 'git push origin work # env check'
decide G benign-sleep-then-push-allows     allow p_cleared PUB 'sleep 1 && git push origin work'
# A wrapper word that is only TEXT (not at the start of a command) is not a wrapper,
# even when git and push follow in the same segment.
decide G benign-message-naming-a-wrapper-word-allows allow p_cleared PUB 'git commit -m "explain the time git push takes"'
decide G benign-echo-naming-a-wrapper-word-allows    allow p_cleared PUB 'echo "run time git push later"'
decide G benign-grep-for-env-git-push-allows         allow p_cleared PUB 'grep -rn "env git push" docs'

# The value of -o and friends is not the remote. If it is read as one and it looks
# like the private ops repo, the whole push is waved through as an ops push. Installed
# but UNCLEARED, so the only way to "allow" is that wrong exemption.
decide RL-034 push-option-ops-url-value-denies       deny p_secret_head PUB 'git push -o @OPSURL@ origin HEAD' 1 'nothing has been cleared'
decide RL-034 push-option-long-ops-url-value-denies  deny p_secret_head PUB 'git push --push-option @OPSURL@ origin HEAD' 1 'nothing has been cleared'
decide RL-034 receive-pack-ops-url-value-denies      deny p_secret_head PUB 'git push --receive-pack @OPSURL@ origin HEAD' 1 'nothing has been cleared'
decide RL-034 exec-ops-url-value-denies              deny p_secret_head PUB 'git push --exec @OPSURL@ origin HEAD' 1 'nothing has been cleared'
decide RL-034 push-option-after-the-remote-denies    deny p_secret_head PUB 'git push origin -o @OPSURL@ HEAD' 1 'nothing has been cleared'
# A genuine ops push with a push option still goes through as ops.
decide RL-034 ops-push-with-a-push-option-allows     allow p_plain OPS 'git push -o ci.skip origin main'

# The config edits git itself offers that drop core.hooksPath without naming it.
decide G config-remove-core-section-denies deny  p_plain PUB 'git config --remove-section core' 1 'core.hooksPath'
decide G config-rename-core-section-denies deny  p_plain PUB 'git config --rename-section core corx' 1 'core.hooksPath'
decide G config-remove-section-quoted-denies deny p_plain PUB "git config --local --remove-section 'core'" 1 'core.hooksPath'
decide G config-edit-short-denies          deny  p_plain PUB 'git config -e' 1 'core.hooksPath'
decide G config-edit-long-denies           deny  p_plain PUB 'git config --edit' 1 'core.hooksPath'
decide G config-local-edit-denies          deny  p_plain PUB 'git config --local --edit' 1 'core.hooksPath'
decide G config-global-edit-denies         deny  p_plain PUB 'git config --global -e' 1 'core.hooksPath'
decide G config-remove-another-section-allows allow p_plain PUB 'git config --remove-section alias'
decide G config-set-a-user-name-allows     allow p_plain PUB 'git config user.name fixture'
decide G config-list-allows                allow p_plain PUB 'git config --list'
decide G config-get-allows                 allow p_plain PUB 'git config --get user.name'

# --- round 3: more wrappers, shell keywords, exact tokens, reads, deletes, the gate's own files ---
R='wrapped git push'
decide G wrapped-absolute-path-env-denies    deny p_cleared PUB '/usr/bin/env git push origin work' 1 "$R"
decide G wrapped-nice-denies                 deny p_cleared PUB 'nice git push origin work' 1 "$R"
decide G wrapped-setsid-denies               deny p_cleared PUB 'setsid git push origin work' 1 "$R"
decide G wrapped-stdbuf-denies               deny p_cleared PUB 'stdbuf -oL git push origin work' 1 "$R"
decide G wrapped-flock-denies                deny p_cleared PUB 'flock /tmp/l git push origin work' 1 "$R"
decide G wrapped-ionice-denies               deny p_cleared PUB 'ionice -c3 git push origin work' 1 "$R"
decide G wrapped-watch-denies                deny p_cleared PUB 'watch git push origin work' 1 "$R"
decide G wrapped-caffeinate-denies           deny p_cleared PUB 'caffeinate git push origin work' 1 "$R"
decide G wrapped-find-exec-denies            deny p_cleared PUB 'find . -maxdepth 0 -exec git push origin work \;' 1 "$R"
decide G wrapped-bash-login-c-denies         deny p_cleared PUB "bash --login -c 'git push origin work'" 1 "$R"
decide G wrapped-bash-o-pipefail-c-denies    deny p_cleared PUB "bash -o pipefail -c 'git push origin work'" 1 "$R"
decide G wrapped-absolute-bash-c-denies      deny p_cleared PUB "/bin/bash -c 'git push origin work'" 1 "$R"
decide G wrapped-after-then-denies           deny p_cleared PUB 'if true; then nice git push origin work; fi' 1 "$R"

# The guard now SEES a push behind a shell keyword, a `!`, a single `&` or a `)`. Installed
# but uncleared, so the only way to "allow" is not recognising the push at all.
CLR='nothing has been cleared'
decide G keyword-if-then-sees-the-push       deny p_plain PUB 'if true; then git push origin work; fi' 1 "$CLR"
decide G keyword-for-do-sees-the-push        deny p_plain PUB 'for b in work; do git push origin $b; done' 1 "$CLR"
decide G keyword-while-do-sees-the-push      deny p_plain PUB 'while true; do git push origin work; break; done' 1 "$CLR"
decide G keyword-until-do-sees-the-push      deny p_plain PUB 'until false; do git push origin work; break; done' 1 "$CLR"
decide G keyword-else-sees-the-push          deny p_plain PUB 'if false; then true; else git push origin work; fi' 1 "$CLR"
decide G keyword-elif-sees-the-push          deny p_plain PUB 'if false; then true; elif true; then git push origin work; fi' 1 "$CLR"
decide G case-arm-sees-the-push              deny p_plain PUB 'case x in x) git push origin work;; esac' 1 "$CLR"
decide G bang-sees-the-push                  deny p_plain PUB '! git push origin work' 1 "$CLR"
decide G single-ampersand-sees-the-push      deny p_plain PUB 'sleep 0 & git push origin work' 1 "$CLR"
decide G benign-single-ampersand-allows      allow p_cleared PUB 'git status & git log -1'
decide G benign-if-without-a-push-allows     allow p_cleared PUB 'if true; then git status; fi'
decide G benign-for-loop-allows              allow p_cleared PUB 'for f in a b; do echo $f; done'
decide G benign-case-without-a-push-allows   allow p_cleared PUB 'case x in x) git status;; esac'
decide G benign-redirect-fd-dup-allows       allow p_cleared PUB 'git push origin work 2>&1'

# `push` is a TOKEN, not a substring: pre-push and push-gate are file names. And the
# git ... push span stops at a command separator.
decide G push-token-git-dash-c-diff-of-the-hook-allows allow p_cleared PUB 'git -c core.pager=cat diff -- .githooks/pre-push'
decide G push-token-GIT_DIR-log-of-the-hook-allows     allow p_cleared PUB 'GIT_DIR=.git git log -1 -- .githooks/pre-push'
decide G push-token-timeout-diff-of-the-hook-allows    allow p_cleared PUB 'timeout 120 git diff -- .githooks/pre-push'
decide G push-token-subshell-diff-of-the-guard-allows  allow p_cleared PUB '(cd .claude && git diff -- hooks/pre-push-guard.sh)'
decide G push-token-xargs-add-of-the-hook-allows       allow p_cleared PUB 'git diff --name-only | xargs git add -- .githooks/pre-push'
decide G push-token-substring-in-a-path-allows         allow p_cleared PUB 'GIT_DIR=.git git log --oneline -3 -- .claude/tools/test-push-gate.sh'
decide G span-timeout-fetch-then-push-allows           allow p_cleared PUB 'timeout 60 git fetch && git push origin work'
decide G span-command-v-then-push-allows               allow p_cleared PUB 'command -v git && git push origin work'
decide G span-xargs-add-then-push-allows               allow p_cleared PUB 'git diff --name-only | xargs git add && git push origin work'
decide G span-dash-c-log-then-push-allows              allow p_cleared PUB 'git -c color.ui=never log -1 && git push origin work'
decide G dash-c-on-a-commit-whose-message-says-push-allows allow p_cleared PUB 'git -c user.name=x commit -m "push gate fix"'
decide G send-pack-as-a-grep-pattern-allows            allow p_plain PUB 'grep -rn send-pack .claude'
decide G send-pack-in-a-log-grep-allows                allow p_plain PUB 'git log --grep=send-pack'
decide G grep-for-no-verify-without-dashes-allows      allow p_plain PUB "grep -n 'no-verify' CLAUDE.md"
decide G git-dash-c-on-a-push-still-denies             deny  p_cleared PUB 'git -c remote.origin.pushurl=@BARE@ push origin work' 1 "GIT_DIR / --git-dir"
decide G git-dash-c-alias-still-denies                 deny  p_cleared PUB 'git -c alias.zz=push zz origin work' 1 "GIT_DIR / --git-dir"

# Every read-only form of core.hooksPath is allowed; every write is still refused.
decide G hooks-path-bare-key-read-allows       allow p_plain PUB 'git config core.hooksPath'
decide G hooks-path-get-all-allows             allow p_plain PUB 'git config --get-all core.hooksPath'
decide G hooks-path-global-get-allows          allow p_plain PUB 'git config --global --get core.hooksPath'
decide G hooks-path-show-origin-get-allows     allow p_plain PUB 'git config --show-origin --get core.hooksPath'
decide G hooks-path-show-scope-get-allows      allow p_plain PUB 'git config --show-scope --get core.hooksPath'
decide G hooks-path-get-subcommand-allows      allow p_plain PUB 'git config get core.hooksPath'
decide G hooks-path-read-inside-a-substitution-allows allow p_plain PUB 'ls "$(git config --get core.hooksPath)"'
decide G hooks-path-read-compared-with-the-hook-allows allow p_plain PUB 'cmp .githooks/pre-push "$(git config --get core.hooksPath)/pre-push"'
decide G hooks-path-global-write-denies        deny  p_plain PUB 'git config --global core.hooksPath /dev/null' 1 'core.hooksPath'
decide G hooks-path-unset-all-denies           deny  p_plain PUB 'git config --unset-all core.hooksPath' 1 'core.hooksPath'
decide G hooks-path-add-denies                 deny  p_plain PUB 'git config --add core.hooksPath /dev/null' 1 'core.hooksPath'
decide G hooks-path-replace-all-denies         deny  p_plain PUB 'git config --replace-all core.hooksPath /dev/null' 1 'core.hooksPath'
decide G hooks-path-deny-says-how-to-read-it   deny  p_plain PUB 'git config core.hooksPath /dev/null' 1 'git config --get core.hooksPath'
decide G no-verify-deny-says-to-grep-without-dashes deny p_plain PUB 'git commit -m "explain --no-verify"' 1 'grep for no-verify without the dashes'

# The installer file is named in many ordinary commands. Only RUNNING it is refused.
decide G installer-add-with-another-file-allows    allow p_plain PUB 'git add .claude/tools/test-push-gate.sh .claude/tools/install-push-gate.sh'
decide G installer-add-after-the-guard-allows      allow p_plain PUB 'git add .claude/hooks/pre-push-guard.sh .claude/tools/install-push-gate.sh'
decide G installer-diff-stat-with-the-guard-allows allow p_plain PUB 'git diff --stat -- .claude/hooks/pre-push-guard.sh .claude/tools/install-push-gate.sh'
decide G installer-log-with-verify-allows          allow p_plain PUB 'git log --oneline -- .claude/hooks/verify.sh .claude/tools/install-push-gate.sh'
decide G installer-wc-with-verify-allows           allow p_plain PUB 'wc -l .claude/hooks/verify.sh .claude/tools/install-push-gate.sh'
decide G installer-shellcheck-with-a-glob-allows   allow p_plain PUB 'shellcheck .claude/hooks/*.sh .claude/tools/install-push-gate.sh'
decide G installer-bash-n-allows                   allow p_plain PUB 'bash -n .claude/tools/install-push-gate.sh'
decide G installer-sh-n-allows                     allow p_plain PUB 'sh -n .claude/tools/install-push-gate.sh'
decide G installer-named-in-a-commit-message-allows allow p_plain PUB 'git commit -m "$(cat <<'"'"'EOF'"'"'
The installer (install-push-gate.sh) now installs the committed hook.
EOF
)"'
decide G installer-run-with-bash-and-flags-still-denies deny p_plain PUB 'bash -e .claude/tools/install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-run-by-path-in-a-subdirectory-still-denies deny p_plain PUB 'cd .claude/tools && ./install-push-gate.sh' 1 'install-push-gate.sh'
decide G installer-deny-text-mentions-staging       deny p_plain PUB 'bash .claude/tools/install-push-gate.sh' 1 'git add'

# Deletes. The git hook (Case's terminal) lets a delete through; the guard (Claude) does not.
DEL='delet'
decide G delete-flag-denies                  deny p_cleared PUB 'git push origin --delete gh-pages' 1 "$DEL"
decide G delete-flag-first-denies            deny p_cleared PUB 'git push --delete origin gh-pages' 1 "$DEL"
decide G delete-short-flag-denies            deny p_cleared PUB 'git push -d origin gh-pages' 1 "$DEL"
decide G delete-colon-refspec-denies         deny p_cleared PUB 'git push origin :gh-pages' 1 "$DEL"
decide G delete-colon-among-refspecs-denies  deny p_cleared PUB 'git push origin work :gh-pages' 1 "$DEL"
decide G delete-force-colon-refspec-denies   deny p_cleared PUB 'git push origin +:gh-pages' 1 "$DEL"
decide G delete-force-colon-among-refspecs-denies deny p_cleared PUB 'git push origin work +:gh-pages' 1 "$DEL"
decide G force-refspec-with-a-colon-in-the-middle-allows allow p_cleared PUB 'git push origin +work:work'
decide G delete-of-an-ops-branch-allows      allow p_plain PUB 'git -C @OPS@ push origin --delete old'
decide G refspec-with-a-colon-in-the-middle-allows allow p_cleared PUB 'git push origin work:work'

# The gate's own files, the config and the refs the hook measures from: no WRITE-ish
# command may name them. Reads stay allowed. (A speed bump, not a wall.)
GW='gate'
decide G write-redirect-into-the-copy-denies       deny  p_plain PUB "printf x > .git/push-gate/pre-push" 1 "$GW"
decide G write-append-into-the-config-denies       deny  p_plain PUB 'echo x >> .git/config' 1 "$GW"
decide G write-tee-into-the-config-denies          deny  p_plain PUB 'tee .git/config < /dev/null' 1 "$GW"
decide G write-sed-i-on-the-config-denies          deny  p_plain PUB "sed -i '/x/d' .git/config" 1 "$GW"
decide G write-sed-i-suffix-on-the-config-denies   deny  p_plain PUB "sed -i.bak '/x/d' .git/config" 1 "$GW"
decide G write-cp-over-the-copy-denies             deny  p_plain PUB 'cp /tmp/x .git/push-gate/pre-push' 1 "$GW"
decide G write-mv-over-the-copy-denies             deny  p_plain PUB 'mv /tmp/x .git/push-gate/pre-push' 1 "$GW"
decide G write-rm-of-the-gate-dir-denies           deny  p_plain PUB 'rm -rf .git/push-gate' 1 "$GW"
decide G write-ln-over-the-copy-denies             deny  p_plain PUB 'ln -sf /dev/null .git/push-gate/pre-push' 1 "$GW"
decide G write-chmod-of-the-copy-denies            deny  p_plain PUB 'chmod -x .git/push-gate/pre-push' 1 "$GW"
decide G write-into-config-worktree-denies         deny  p_plain PUB "printf x > .git/config.worktree" 1 "$GW"
decide G write-into-a-remote-ref-file-denies       deny  p_plain PUB 'echo abc > .git/refs/remotes/origin/main' 1 "$GW"
decide G write-tee-into-refs-remotes-denies        deny  p_plain PUB 'echo abc | tee refs/remotes/origin/main' 1 "$GW"
decide G write-the-worktree-config-extension-denies deny p_plain PUB 'git config extensions.worktreeConfig true' 1 "$GW"
decide G write-git-config-f-on-the-config-denies   deny  p_plain PUB 'git config -f .git/config alias.x y' 1 "$GW"
decide G update-ref-denies                         deny  p_plain PUB 'git update-ref refs/remotes/origin/main HEAD' 1 "$GW"
decide G update-ref-delete-denies                  deny  p_plain PUB 'git update-ref -d refs/remotes/origin/main' 1 "$GW"
decide G symbolic-ref-write-denies                 deny  p_plain PUB 'git symbolic-ref HEAD refs/heads/x' 1 "$GW"
decide G symbolic-ref-delete-denies                deny  p_plain PUB 'git symbolic-ref -d HEAD' 1 "$GW"
decide G read-cat-the-config-allows                allow p_plain PUB 'cat .git/config'
decide G read-grep-the-config-allows               allow p_plain PUB 'grep -n hooksPath .git/config'
decide G read-cat-the-config-with-a-redirect-allows allow p_plain PUB 'cat .git/config 2>/dev/null'
decide G read-ls-the-gate-dir-allows               allow p_plain PUB 'ls -la .git/push-gate'
decide G read-cat-the-copy-allows                  allow p_plain PUB 'cat .git/push-gate/pre-push'
decide G read-cmp-the-copy-allows                  allow p_plain PUB 'cmp .git/push-gate/pre-push .githooks/pre-push'
decide G read-cksum-the-copy-allows                allow p_plain PUB 'cksum < .git/push-gate/pre-push'
decide G read-rev-parse-a-remote-ref-allows        allow p_plain PUB 'git rev-parse refs/remotes/origin/main'
decide G read-log-a-remote-ref-allows              allow p_plain PUB 'git log -1 refs/remotes/origin/main'
decide G read-for-each-ref-remotes-allows          allow p_plain PUB 'git for-each-ref refs/remotes'
decide G read-show-the-committed-hook-allows       allow p_plain PUB 'git show refs/remotes/origin/main:.githooks/pre-push'
decide G read-symbolic-ref-short-allows            allow p_plain PUB 'git symbolic-ref --short HEAD'
decide G read-symbolic-ref-head-allows             allow p_plain PUB 'git symbolic-ref HEAD'
decide G read-config-get-allows                    allow p_plain PUB 'git config --get remote.origin.url'
decide G read-config-f-get-allows                  allow p_plain PUB 'git config -f .git/config --get core.bare'
decide G read-the-worktree-config-extension-allows allow p_plain PUB 'git config --get extensions.worktreeConfig'
decide G read-fetch-allows                         allow p_plain PUB 'git fetch origin'
decide G read-remote-v-allows                      allow p_plain PUB 'git remote -v'

# WIN: on Git Bash `git config --get core.hooksPath` returns C:/Users/... for
# what the installer wrote as /c/Users/.... A drive-letter path is absolute; a
# bare "C:gate" (drive-relative) and a plain relative path are not.
# (SKIP on Windows: there a drive-letter path is REAL, so these Linux fixtures mean nothing.)
sim_skip WIN drive-letter-forward-slash-is-absolute || decide WIN drive-letter-forward-slash-is-absolute  allow p_win_fwd       PUB 'git push origin work' 0
sim_skip WIN drive-letter-lowercase-is-absolute     || decide WIN drive-letter-lowercase-is-absolute      allow p_win_fwd_lower PUB 'git push origin work' 0
sim_skip WIN drive-letter-backslash-is-absolute     || decide WIN drive-letter-backslash-is-absolute      allow p_win_back      PUB 'git push origin work' 0
sim_skip WIN drive-relative-path-is-not-absolute    || decide WIN drive-relative-path-is-not-absolute     deny  p_win_driverel  PUB 'git push origin work' 0 install-push-gate.sh

# COPY: the installed hook is a COPY in the git dir, not a path into a work tree.
# The main checkout on a branch with no .githooks/ must not switch the gate off.
decide COPY copy-survives-main-on-a-branch-without-githooks allow p_main_old_branch PUB 'git push origin old' 0
decide COPY deleted-copy-denies            deny  p_copy_deleted  PUB 'git push origin work' 0 install-push-gate.sh
decide COPY unmarked-copy-denies           deny  p_copy_unmarked PUB 'git push origin work' 0 install-push-gate.sh
sim_skip COPY non-executable-copy-denies || decide COPY non-executable-copy-denies     deny  p_copy_noexec   PUB 'git push origin work' 0 install-push-gate.sh
# The marker and the exec bit are not proof of what the copy DOES. It is trusted only
# if it equals a COMMITTED .githooks/pre-push (this checkout's HEAD, or origin/main),
# so a copy that was edited, or overwritten with a stub that keeps the marker, is a
# deny, not a note that only Claude would ever see.
decide COPY edited-copy-denies             deny  p_copy_edited   PUB 'git push origin work' 0 install-push-gate.sh
decide COPY stub-copy-with-the-marker-denies deny p_copy_stub    PUB 'git push origin work' 0 install-push-gate.sh
decide COPY edited-copy-denies-the-reason-names-the-commits deny p_copy_edited PUB 'git push origin work' 0 'origin/main'
decide_warn COPY fresh-copy-does-not-warn  p_installed PUB 'git push origin work' no
p_wt_installed() { fx_install; fx_worktree; fx_clear "$WT"; }  # the worktree has no .githooks/
decide_warn COPY no-source-hook-means-no-stale-warning p_wt_installed WT 'git push origin wtb' no
# In a worktree whose checkout has NO .githooks/ there is nothing local to compare
# with, but origin/main has the file, so a tampered copy is still a deny.
p_wt_tampered() { p_wt_installed; printf '# tampered\n' >> "$PUB/$COPY_REL"; }
decide COPY tampered-copy-in-a-worktree-without-githooks-denies deny p_wt_tampered WT 'git push origin wtb' 0 install-push-gate.sh
# An UNCOMMITTED edit to the work-tree file is not a reason to distrust the copy,
# and is not a way to install a weakened one: the copy equals HEAD, so it passes.
p_wt_file_edited() { fx_clear "$PUB"; fx_install; printf '# an uncommitted edit\n' >> "$PUB/.githooks/pre-push"; }
decide_warn COPY copy-equal-to-head-ignores-an-uncommitted-worktree-edit p_wt_file_edited PUB 'git push origin work' no
# ... and editing the copy AND the work-tree file the same way does not launder it:
# only a COMMITTED hook counts as known-good, and neither of these is committed.
p_both_edited() {
  fx_clear "$PUB"; fx_install
  printf '# edited in both places\nexit 0\n' >> "$PUB/$COPY_REL"
  printf '# edited in both places\nexit 0\n' >> "$PUB/.githooks/pre-push"
}
decide COPY copy-and-worktree-file-edited-alike-still-denies deny p_both_edited PUB 'git push origin work' 0 install-push-gate.sh
# Line endings are ignored when the copy is compared with the committed hook: a hook
# committed with CRLF and the LF copy the installer wrote from it are the same hook.
# (The committed hook also differs in content from origin/main's, so the only way for
# the copy to be recognised is HEAD's blob compared with its carriage returns ignored.)
p_crlf_head() {
  fx_install
  git -C "$PUB" checkout -q -b crlf
  printf '# a newer hook, committed with CRLF line endings\n' >> "$PUB/.githooks/pre-push"
  crlf_of "$PUB/.githooks/pre-push" "$W/crlf-hook" && cp "$W/crlf-hook" "$PUB/.githooks/pre-push"
  git -C "$PUB" commit -q -am "hook with CRLF line endings"
  # what an install from this branch writes: the committed blob, with LF endings
  git -C "$PUB" show HEAD:.githooks/pre-push | tr -d '\r' > "$PUB/$COPY_REL"
  chmod 755 "$PUB/$COPY_REL"
  fx_clear "$PUB"
}
decide COPY crlf-committed-hook-and-lf-copy-are-the-same-hook allow p_crlf_head PUB 'git push origin crlf' 0
# The copy equals origin/main's hook and nothing else: this branch's HEAD and local main
# both carry a newer one. origin/main is a known-good source on its own.
p_origin_main_only() {
  fx_install
  git -C "$PUB" checkout -q main
  printf '# a newer hook on local main\n' >> "$PUB/.githooks/pre-push"
  git -C "$PUB" commit -q -am "newer hook on local main"
  git -C "$PUB" checkout -q -b other
  fx_clear "$PUB"
}
decide COPY copy-equal-to-origin-main-alone-passes allow p_origin_main_only PUB 'git push origin other' 0
# The converse: CRs are only ever ignored on the BLOB side. A copy with carriage returns
# in it is not the committed hook, even though stripping them would make it look like it.
decide COPY cr-poisoned-copy-denied             deny  p_copy_cr_poisoned PUB 'git push origin work' 0 install-push-gate.sh
# Bootstrap: installed from local main while origin/main has no hook yet, pushing from a
# worktree on a branch from before the gate. The copy is local main's committed hook.
decide COPY copy-equal-to-local-main-passes-before-the-gate-reaches-origin-main allow p_bootstrap_wt WT 'git push origin wtb' 0
decide COPY bootstrap-tampered-copy-denies      deny  p_bootstrap_wt_tampered WT 'git push origin wtb' 0 'reaches origin/main'
decide COPY deny-text-says-to-pull-main-then-re-run deny p_copy_edited PUB 'git push origin work' 0 'pull main in the main checkout'
decide G hook-not-installed-deny-names-the-claude-ai-setup-script deny p_cleared PUB 'git push origin work' 0 'Setup script'
decide G hook-not-installed-deny-says-to-confirm-the-script-runs-after-the-clone deny p_cleared PUB 'git push origin work' 0 'after the repo is cloned'
# The copy is the OLDER hook: HEAD has a newer committed version, origin/main still
# has the one that is installed. Allowed (it is a known-good version), with a note.
p_copy_older_than_head() {
  fx_install
  printf '# a newer hook, committed on this branch\n' >> "$PUB/.githooks/pre-push"
  git -C "$PUB" commit -q -am "newer hook"
  fx_clear "$PUB"
}
decide_warn COPY copy-matching-origin-main-but-older-than-head-warns p_copy_older_than_head PUB 'git push origin work' yes 'differs'

# =============================================================================
# Legitimate use must keep working.
# =============================================================================
decide L ops-by-cwd-allows                 allow p_plain OPS 'git push'
decide L ops-by-dash-C-allows              allow p_plain PUB 'git -C @OPS@ push origin main'
decide L ops-by-cd-allows                  allow p_plain PUB 'cd @OPS@ && git push'
decide L mixed-ops-and-public-denies       deny  p_plain PUB 'git -C @OPS@ push origin main && git push origin work'
decide L look-alike-url-denies             deny  p_lookalike PUB 'git push evil work'
decide L stale-clearance-denies            deny  p_stale PUB 'git push origin work'
decide L no-clearance-denies               deny  p_plain PUB 'git push origin work'

no_python_guard() {
  want_tag L || return 0
  local bindir="$W/nopy" b p out
  mkdir -p "$bindir"
  for b in git cat grep tr sed awk ls dirname basename env sh; do
    p="$(command -v "$b" 2>/dev/null)" && ln -sf "$p" "$bindir/$b"
  done
  fx_new; p_cleared; fx_install
  out="$(printf '%s' "$(guard_json "$PUB" 'git push origin work')" | PATH="$bindir" "$(command -v bash)" "$GUARD" 2>/dev/null)"
  case "$out" in
    *'"permissionDecision": "deny"'*|*'"permissionDecision":"deny"'*) record L no-python3-denies PASS "guard: deny" ;;
    *) record L no-python3-denies FAIL "expected the guard to deny with python3 off PATH, got: $(printf '%s' "$out" | cut -c1-100)" ;;
  esac
}
no_python_guard

# A cleared push of each shape really lands, with the hook installed.
legit_push() { # NAME PREP BRANCH [worktree]
  local name="$1" prep="$2" br="$3" where="${4:-PUB}" cwd want got
  want_tag L || return 0
  fx_new; "$prep"
  [ "$where" = WT ] && { fx_worktree; fx_clear "$WT"; }
  fx_install
  cwd="$(cwd_of "$where")"
  want="$(git -C "$cwd" rev-parse HEAD)"
  via_guard "$cwd" "git push origin $br"
  got="$(git -C "$BARE" rev-parse "refs/heads/$br" 2>/dev/null)"
  if [ "$G_DECISION" = allow ] && [ "$RC" = 0 ] && [ "$got" = "$want" ]; then
    record L "$name" PASS "bare $br = local HEAD"
  else
    record L "$name" FAIL "cleared push did not land (guard=$G_DECISION rc=${RC:-none} remote=${got:-absent}): $(printf '%s' "${G_REASON:-$OUT}" | tail -2 | cut -c1-140)"
  fi
}
legit_push cleared-new-branch-push       p_cleared work
legit_push cleared-existing-branch-push  p_existing work
legit_push cleared-worktree-push-no-githooks-in-checkout p_plain wtb WT

# =============================================================================
# T: Case's own terminal. No PreToolUse hook is in the way; only git's hook is.
# =============================================================================
terminal() { # NAME EXPECT(block|pass) COMMAND [POST-INSTALL-STEP] [TAG]
  local name="$1" want="$2" cmd="$3" post="${4:-}" tag="${5:-T}" before after
  want_tag "$tag" || return 0
  if [ -z "$HOOK_SRC" ]; then record "$tag" "$name" FAIL "no git hook exists at this revision"; return; fi
  fx_new; p_plain; fx_install
  [ -z "$post" ] || "$post"
  before="$(git -C "$BARE" for-each-ref | cksum)"
  run_cmd "$PUB" "$cmd"
  after="$(git -C "$BARE" for-each-ref | cksum)"
  if [ "$want" = block ] && [ "$RC" != 0 ] && [ "$before" = "$after" ]; then
    record "$tag" "$name" PASS "rc=$RC, remote unchanged"
  elif [ "$want" = pass ] && [ "$RC" = 0 ]; then
    record "$tag" "$name" PASS "rc=0"
  else
    record "$tag" "$name" FAIL "wanted $want, got rc=$RC remote-changed=$([ "$before" = "$after" ] && echo no || echo yes): $(printf '%s' "$OUT" | tail -1 | cut -c1-120)"
  fi
}
terminal uncleared-push-is-blocked         block 'git push origin work'
terminal uncleared-dry-run-is-blocked      block 'git push --dry-run origin work'
terminal no-verify-skips-the-gate          pass  'git push --no-verify origin work'
terminal no-verify-dry-run-passes          pass  'git push --dry-run --no-verify origin work'
# A delete publishes nothing, and git sends it as "(delete) 0000... <ref> <sha>".
terminal branch-delete-needs-no-clearance  pass  'git push --no-verify origin work && git push origin --delete work'
terminal up-to-date-push-passes            pass  'git push --no-verify origin work && git push origin work'
# A push that publishes no new commit has nothing to review: a new branch created at
# origin/main (range X..X), and a branch moved BACK onto commits that are already
# there. /publish-review writes no clearance for X..X, so without this the only way
# through was --no-verify.
terminal new-branch-at-origin-main-passes  pass  'git push origin main:refs/heads/same-as-main'
terminal new-branch-with-a-commit-still-needs-clearance block 'git push origin work:refs/heads/new-work'
# The gate follows the clone, not the branch checked out in its main work tree.
# Installed first, THEN the main checkout moves to a branch with no .githooks/,
# and an uncleared push from it must still be refused.
p_to_old_branch() { git -C "$PUB" checkout -q -b old "$A0"; fx_commit "$PUB" old.txt "old branch work"; }
terminal main-on-a-branch-without-githooks-still-blocks block 'git push origin old' p_to_old_branch COPY
terminal no-verify-still-works-from-that-branch pass 'git push --no-verify origin old' p_to_old_branch COPY

# =============================================================================
# HOOK: the hook called directly, the way git calls it, in every shell we have.
# =============================================================================
hook_call() { # NAME WANT-RC  URL  STDIN  [VAR=value ...]  (cwd: $HC_CWD)
  local name="$1" want="$2" url="$3" input="$4" shell sh_list got msg
  want_tag HOOK || return 0
  if [ -z "$HOOK_SRC" ]; then record HOOK "$name" FAIL "no git hook exists at this revision"; return; fi
  sh_list="sh"
  command -v dash >/dev/null 2>&1 && sh_list="$sh_list dash"
  command -v bash >/dev/null 2>&1 && sh_list="$sh_list bash"
  for shell in $sh_list; do
    # $5 is deliberately unquoted: a few space-free VAR=value words for env.
    msg="$(cd "$HC_CWD" && printf '%s' "$input" | env ${5:-} "$shell" "$W/hookdir/pre-push" origin "$url" 2>&1 >/dev/null)"
    got=$?
    if [ "$got" != "$want" ]; then
      record HOOK "$name" FAIL "[$shell] wanted rc=$want, got rc=$got: $(printf '%s' "$msg" | head -1 | cut -c1-120)"
      return
    fi
  done
  record HOOK "$name" PASS "rc=$want in: $sh_list"
}

if want_tag HOOK; then
  fx_new; p_cleared; HC_CWD="$PUB"
  L1="refs/heads/work $C refs/heads/work $ZERO"
  LS="refs/heads/secret $S refs/heads/secret $ZERO"
  hook_call empty-stdin-allows                0 'file:///x' ''
  # The ops exemption is decided on $2 alone: an UNCLEARED ref passes to ops and
  # is held to the clearance for anything that merely looks like ops.
  hook_call ops-url-uncleared-ref-allows      0 "$OPSURL" "$LS
"
  hook_call ops-url-dot-git-allows            0 "${OPSURL}.git" "$LS
"
  hook_call ops-url-ssh-allows                0 'git@github.com:caseydyer8/roastlogs-ops.git' "$LS
"
  hook_call look-alike-ops-url-denies         1 "${OPSURL}.evil" "$LS
"
  hook_call look-alike-host-denies            1 'https://evil.example/github.com/caseydyer8/roastlogs-ops' "$LS
"
  hook_call look-alike-suffix-denies          1 "${OPSURL}/extra" "$LS
"
  # grep -E matches LINE BY LINE, so "anchored at both ends" is only true of a single
  # line. A URL with a second line in it (a directory with that name, say) must not
  # borrow the ops exemption: any control character in the URL rules it out.
  hook_call multi-line-url-with-an-ops-last-line-denies 1 "$(printf 'file:///x\n%s' "$OPSURL")" "$LS
"
  hook_call multi-line-url-with-an-ops-first-line-denies 1 "$(printf '%s\nfile:///x' "$OPSURL")" "$LS
"
  hook_call url-with-a-tab-denies             1 "$(printf '%s\t' "$OPSURL")" "$LS
"
  hook_call url-with-a-carriage-return-denies 1 "$(printf '%s\r' "$OPSURL")" "$LS
"
  hook_call three-field-line-denies           1 'file:///x' "refs/heads/work $C refs/heads/work
"
  hook_call six-field-line-denies             1 'file:///x' "$L1 extra more
"
  hook_call non-hex-sha-denies                1 'file:///x' "refs/heads/work ${C%?}z refs/heads/work $ZERO
"
  hook_call blank-line-denies                 1 'file:///x' "
$L1
"
  hook_call cleared-new-branch-allows         0 'file:///x' "$L1
"
  hook_call uncleared-sha-denies              1 'file:///x' "refs/heads/secret $S refs/heads/secret $ZERO
"
  # A push that publishes no new commit has nothing to clear (rev-list --count is 0):
  # a new branch AT origin/main, and a branch moved back onto commits already there.
  # P_CLEARED holds a clearance for work (A..C), which matches neither line.
  hook_call new-branch-at-origin-main-publishes-nothing 0 'file:///x' "refs/heads/same $A refs/heads/same $ZERO
"
  hook_call branch-moved-back-publishes-nothing 0 'file:///x' "refs/heads/work $A refs/heads/work $C
"
  hook_call tag-ref-denies                    1 'file:///x' "refs/tags/v-secret $S refs/tags/v-secret $ZERO
"
  hook_call remote-tracking-ref-denies        1 'file:///x' "refs/remotes/origin/main $A refs/remotes/origin/main $ZERO
"
  hook_call two-refs-deny                     1 'file:///x' "$L1
refs/heads/secret $S refs/heads/secret $ZERO
"
  hook_call branch-delete-allows              0 'file:///x' "(delete) $ZERO refs/heads/old $A
"
  hook_call tag-delete-allows                 0 'file:///x' "(delete) $ZERO refs/tags/old $A
"
  hook_call delete-plus-cleared-allows        0 'file:///x' "(delete) $ZERO refs/heads/old $A
$L1
"
  hook_call delete-plus-uncleared-denies      1 'file:///x' "(delete) $ZERO refs/heads/old $A
refs/heads/secret $S refs/heads/secret $ZERO
"
  # The hook calls grep, tr, cat and git through PATH. A directory put first on PATH
  # with a grep that always succeeds would turn every "does the URL look like ops?"
  # test into a yes. The hook pins PATH to the system directories first.
  mkdir -p "$W/fakebin-grep"
  printf '#!/bin/sh\nexit 0\n' > "$W/fakebin-grep/grep"; chmod 755 "$W/fakebin-grep/grep"
  hook_call a-fake-grep-first-on-PATH-does-not-exempt 1 'file:///x' "$LS
" "PATH=$W/fakebin-grep:$PATH"
  mkdir -p "$W/fakebin-tr"
  printf '#!/bin/sh\nexit 1\n' > "$W/fakebin-tr/tr"; chmod 755 "$W/fakebin-tr/tr"
  hook_call a-fake-tr-first-on-PATH-does-not-break-the-match 0 'file:///x' "$L1
" "PATH=$W/fakebin-tr:$PATH"
  # Existing remote branch: the range starts at the REMOTE sha, not at origin/main.
  hook_call wrong-remote-sha-denies           1 'file:///x' "refs/heads/work $C refs/heads/work $A0
"
  # GIT_DIR pointing at the public repo from the ops checkout: cwd says ops. The
  # ops checkout carries a clearance that matches this very push, as if forged:
  # only the repo-mismatch rule stands between that and an allow.
  HC_CWD="$OPS"
  mkdir -p "$OPS/.session"
  printf '%s' "${A}..${C}" > "$OPS/.session/publish-clearance"
  hook_call git-dir-from-other-cwd-denies     1 'file:///x' "$L1
" "GIT_DIR=$PUB/.git"
  # --git-dir X --work-tree Y: git exports both, so the checkout IS Y. A cleared
  # push is fine there; an uncleared one is not.
  hook_call git-dir-and-work-tree-cleared     0 'file:///x' "$L1
" "GIT_DIR=$PUB/.git GIT_WORK_TREE=$PUB"
  hook_call git-dir-and-work-tree-uncleared   1 'file:///x' "refs/heads/secret $S refs/heads/secret $ZERO
" "GIT_DIR=$PUB/.git GIT_WORK_TREE=$PUB"
fi

# If rev-list cannot count the range (the remote sha is an object this clone does not
# have), the hook must fail CLOSED, not read "no output" as "nothing new". The
# clearance on file is forged to match the unreadable range exactly, so a hook that
# compared strings and skipped the count would let it through.
if want_tag HOOK; then
  if [ -n "$HOOK_SRC" ]; then
    fx_new; p_plain; HC_CWD="$PUB"
    BOGUS='1234567890123456789012345678901234567890'
    mkdir -p "$PUB/.session"
    printf '%s' "${BOGUS}..${C}" > "$PUB/.session/publish-clearance"
    hook_call unreadable-range-fails-closed   1 'file:///x' "refs/heads/work $C refs/heads/work $BOGUS
"
  else
    record HOOK unreadable-range-fails-closed FAIL "no git hook exists at this revision"
  fi
fi

# A shallow clone loses the merge-base for a new branch: it must fail closed.
if want_tag HOOK; then
  if [ -z "$HOOK_SRC" ]; then
    record HOOK shallow-clone-new-branch-fails-closed FAIL "no git hook exists at this revision"
  else
    FXN=$((FXN + 1)); FX="$W/fx$FXN"; mkdir -p "$FX"
    UP="$FX/up"; BARE="$FX/origin.git"; SH="$FX/shallow"
    git init -q "$UP"; git -C "$UP" symbolic-ref HEAD refs/heads/main; cfg "$UP"
    fx_commit "$UP" a.txt m1
    git -C "$UP" checkout -q -b feat
    fx_commit "$UP" f.txt f1
    git -C "$UP" checkout -q main
    fx_commit "$UP" b.txt m2
    git clone -q --bare "$UP" "$BARE"
    git clone -q --depth 1 --no-single-branch "file://$BARE" "$SH" 2>/dev/null
    cfg "$SH"
    git -C "$SH" checkout -q -b newbr origin/feat
    fx_commit "$SH" n.txt n1
    N1="$(git -C "$SH" rev-parse HEAD)"
    git -C "$SH" config core.hooksPath "$W/hookdir"
    mkdir -p "$SH/.session"
    printf 'root..%s' "$N1" > "$SH/.session/publish-clearance"
    git -C "$SH" merge-base origin/main HEAD >/dev/null 2>&1
    pre=$?
    before="$(git -C "$BARE" for-each-ref | cksum)"
    out="$(cd "$SH" && git push origin newbr 2>&1)"; rc=$?
    after="$(git -C "$BARE" for-each-ref | cksum)"
    if [ "$pre" -eq 0 ]; then
      record HOOK shallow-clone-new-branch-fails-closed FAIL "fixture does not reproduce the gap: merge-base succeeded in the shallow clone"
    elif [ "$rc" -ne 0 ] && [ "$before" = "$after" ] && printf '%s' "$out" | grep -q 'merge-base'; then
      record HOOK shallow-clone-new-branch-fails-closed PASS "rc=$rc, remote unchanged"
    else
      record HOOK shallow-clone-new-branch-fails-closed FAIL "expected a merge-base denial, got rc=$rc: $(printf '%s' "$out" | tail -1 | cut -c1-120)"
    fi
  fi
fi

# =============================================================================
# INST: the installer.
# =============================================================================
inst_new() { fx_new; p_plain; GATE="$PUB/.git/push-gate"; }  # the copy dir the installer should create
# The installer asks for a typed confirmation when the hook it would install is not
# identical to origin/main's, and refuses outright with no terminal. Run it on a real
# pseudo-terminal to answer. (python3 pty: not available on Windows, where those probes SKIP.)
inst_pty() { # DIR TYPED [installer args...] -> RC, OUT
  local dir="$1" typed="$2"; shift 2
  OUT="$(cd "$dir" && PTY_TYPED="$typed" python3 -c '
import os, pty, select, sys, time
typed = os.environ["PTY_TYPED"]
pid, fd = pty.fork()
if pid == 0:
    os.execvp("bash", ["bash"] + sys.argv[1:])
out = b""
sent = False
deadline = time.time() + 40
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 1)
    if r:
        try:
            d = os.read(fd, 4096)
        except OSError:
            break
        if not d:
            break
        out += d
        if not sent and b"to continue" in out:
            os.write(fd, typed.encode() + b"\n")
            sent = True
else:
    os.kill(pid, 9)
_, st = os.waitpid(pid, 0)
sys.stdout.write(out.decode("utf-8", "replace").replace("\r", ""))
sys.exit(os.WEXITSTATUS(st) if os.WIFEXITED(st) else 1)
' "$INSTALLER" "$@" 2>&1)"; RC=$?
}
# origin/main moves to the commit HEAD points at (a fixture-level edit of a local ref).
fx_origin_main_to_head() { git -C "$PUB" update-ref refs/remotes/origin/main "$(git -C "$PUB" rev-parse HEAD)"; }
fx_origin_main_gone()    { git -C "$PUB" update-ref -d refs/remotes/origin/main; }
if want_tag INST; then
  if [ "$MODE" = baseline ]; then
    record INST installer SKIP "no installer at the baseline revision"
  else
    inst_new
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    got="$(git -C "$PUB" config --get core.hooksPath)"
    check INST installs-absolute-path-of-the-copy-dir $([ "$rc" = 0 ] && sd "$got" "$GATE" && echo 0 || echo 1) "rc=$rc hooksPath='$got' (wanted '$GATE')"
    cmp -s "$PUB/.githooks/pre-push" "$GATE/pre-push" && [ -x "$GATE/pre-push" ] && grep -q 'roastlogs-push-gate v1' "$GATE/pre-push"
    check INST copy-is-executable-marked-and-identical-to-the-source $? "no executable, marked, identical copy at $GATE/pre-push"
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST second-run-is-idempotent $([ "$rc" = 0 ] && sd "$(git -C "$PUB" config --get core.hooksPath)" "$GATE" && echo 0 || echo 1) "rc=$rc"
    printf '# an edit made after install\n' >> "$GATE/pre-push"
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    cmp -s "$PUB/.githooks/pre-push" "$GATE/pre-push"
    check INST second-run-refreshes-a-stale-copy $([ "$rc" = 0 ] && cmp -s "$PUB/.githooks/pre-push" "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc; the copy still differs from .githooks/pre-push"
    # Content identical but the exec bit lost (a copy through a tool that drops
    # modes): git then skips the hook with only a warning, so a rerun must repair it.
    if ! sim_skip INST rerun-repairs-a-copy-that-lost-its-executable-bit; then
      chmod 644 "$GATE/pre-push"
      (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
      check INST rerun-repairs-a-copy-that-lost-its-executable-bit $([ "$rc" = 0 ] && [ -x "$GATE/pre-push" ] && echo 0 || echo 1) "rc=$rc; the copy is still not executable"
    fi

    # The old layout pointed core.hooksPath into the work tree, where a branch
    # without .githooks/ leaves it pointing at nothing. Moving off it is the point.
    inst_new
    git -C "$PUB" config core.hooksPath "$PUB/.githooks"
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST moves-the-in-work-tree-layout-to-the-copy $([ "$rc" = 0 ] && sd "$(git -C "$PUB" config --get core.hooksPath)" "$GATE" && [ -x "$GATE/pre-push" ] && echo 0 || echo 1) "rc=$rc hooksPath='$(git -C "$PUB" config --get core.hooksPath)'"

    inst_new
    git -C "$PUB" config core.hooksPath other-hooks
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST refuses-a-different-hooks-path $([ "$rc" != 0 ] && [ "$(git -C "$PUB" config --get core.hooksPath)" = other-hooks ] && echo 0 || echo 1) "rc=$rc"

    inst_new; fx_worktree
    (cd "$WT" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST from-a-worktree-installs-into-the-shared-git-dir $([ "$rc" = 0 ] && sd "$(git -C "$PUB" config --get core.hooksPath)" "$GATE" && [ -x "$GATE/pre-push" ] && echo 0 || echo 1) "rc=$rc hooksPath='$(git -C "$PUB" config --get core.hooksPath)'"

    inst_new
    printf '#!/bin/sh\nexit 0\n' > "$PUB/.git/hooks/pre-commit"; chmod 755 "$PUB/.git/hooks/pre-commit"
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST refuses-to-shadow-an-existing-hook $([ "$rc" != 0 ] && [ -z "$(git -C "$PUB" config --get core.hooksPath)" ] && echo 0 || echo 1) "rc=$rc"
    (cd "$PUB" && bash "$INSTALLER" --force) >/dev/null 2>&1; rc=$?
    check INST force-accepts-the-shadowed-hook $([ "$rc" = 0 ] && [ -n "$(git -C "$PUB" config --get core.hooksPath)" ] && echo 0 || echo 1) "rc=$rc"
    # After a --force install the shadowing was accepted. Running it again must
    # not ask again: it is already installed.
    out="$(cd "$PUB" && bash "$INSTALLER" 2>&1)"; rc=$?
    check INST rerun-after-a-force-install-skips-the-shadow-check $([ "$rc" = 0 ] && printf '%s' "$out" | grep -q 'already installed' && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | head -1 | cut -c1-120)"

    # The installer installs the COMMITTED hook, so "no hook" and "no marker" are
    # properties of what HEAD holds, not of the work-tree file.
    # (origin/main is taken away in these three: the installer prefers ITS copy of the
    # hook, so with it present a bad branch hook would simply not be the source. With it
    # gone the branch hook is the source, which needs the typed confirmation.)
    inst_new; fx_origin_main_gone
    git -C "$PUB" rm -q .githooks/pre-push && git -C "$PUB" commit -q -m "drop the hook"
    inst_pty "$PUB" install; rc=$RC
    check INST refuses-when-no-commit-has-the-hook $([ "$rc" != 0 ] && [ -z "$(git -C "$PUB" config --get core.hooksPath)" ] && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$OUT" | tail -2 | tr '\n' ' ' | cut -c1-160)"

    inst_new; fx_origin_main_gone
    printf '#!/bin/sh\nexit 0\n' > "$PUB/.githooks/pre-push"
    git -C "$PUB" commit -q -am "a hook without the marker"
    inst_pty "$PUB" install; rc=$RC
    check INST refuses-a-hook-without-the-marker $([ "$rc" != 0 ] && [ -z "$(git -C "$PUB" config --get core.hooksPath)" ] && printf '%s' "$OUT" | grep -q 'marker' && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$OUT" | tail -2 | tr '\n' ' ' | cut -c1-160)"

    # A hook that exists only in the work tree (never committed) is not installable.
    inst_new; fx_origin_main_gone
    git -C "$PUB" rm -q --cached .githooks/pre-push && git -C "$PUB" commit -q -m "untrack the hook"
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST refuses-a-hook-that-is-only-in-the-work-tree $([ "$rc" != 0 ] && [ -z "$(git -C "$PUB" config --get core.hooksPath)" ] && echo 0 || echo 1) "rc=$rc: the untracked work-tree file was installed"

    # Install the COMMITTED blob, never the work-tree file. Claude can edit that file
    # freely; if the installer copied it, "refreshing" the gate would install the
    # weakened version, and the copy would then equal the checkout, so nothing
    # would even look stale.
    inst_new
    WEAK="$W/weakened-hook"
    sed 's/^INPUT=\$(cat).*/exit 0/' "$PUB/.githooks/pre-push" > "$WEAK"
    printf '\nexit 0\n' >> "$WEAK"
    cp "$WEAK" "$PUB/.githooks/pre-push"
    out="$(cd "$PUB" && bash "$INSTALLER" 2>&1)"; rc=$?
    git -C "$PUB" show HEAD:.githooks/pre-push | cmp -s - "$GATE/pre-push"; same=$?
    check INST uncommitted-weakening-is-not-installed $([ "$rc" = 0 ] && [ "$same" -eq 0 ] && ! cmp -s "$WEAK" "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc same-as-HEAD=$same; the installed copy is not the committed hook"
    printf '%s' "$out" | grep -qi 'differs'
    check INST says-so-when-the-work-tree-file-differs $? "no NOTE that .githooks/pre-push differs from the committed hook: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-200)"
    git -C "$PUB" checkout -q -- .githooks/pre-push

    # Every install says what it installed: the source commit and a checksum.
    inst_new
    out="$(cd "$PUB" && bash "$INSTALLER" 2>&1)"; rc=$?
    HEADSHORT="$(git -C "$PUB" rev-parse --short refs/remotes/origin/main)"   # the installer prefers origin/main's hook
    SUMNOW="$(cksum < "$GATE/pre-push" | cut -d' ' -f1)"
    check INST reports-the-source-commit $([ "$rc" = 0 ] && printf '%s' "$out" | grep -q "$HEADSHORT" && echo 0 || echo 1) "rc=$rc; the output does not name commit $HEADSHORT: $(printf '%s' "$out" | head -3 | tr '\n' ' ' | cut -c1-200)"
    check INST reports-a-checksum-of-the-copy $(printf '%s' "$out" | grep -q "$SUMNOW" && echo 0 || echo 1) "the output does not carry the cksum $SUMNOW of the installed copy"
    out="$(cd "$PUB" && bash "$INSTALLER" 2>&1)"
    check INST reports-them-on-a-rerun-too $(printf '%s' "$out" | grep -q "$HEADSHORT" && printf '%s' "$out" | grep -q "$SUMNOW" && echo 0 || echo 1) "a re-run (already installed) does not report the commit and checksum"

    # Line endings. A CRLF hook does not parse under sh: git cannot exec it, every
    # push from the clone fails. The installer writes LF whatever it was given.
    inst_new
    git -C "$PUB" checkout -q -b crlf
    crlf_of "$PUB/.githooks/pre-push" "$W/crlf-hook" && cp "$W/crlf-hook" "$PUB/.githooks/pre-push"
    git -C "$PUB" commit -q -am "hook with CRLF line endings"
    fx_origin_main_to_head       # identical to origin/main now, so no confirmation is asked
    git -C "$PUB" show refs/remotes/origin/main:.githooks/pre-push | grep -q "$(printf '\r')"
    check INST fixture-committed-a-crlf-hook $? "the fixture failed to commit a CRLF hook"
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST crlf-source-installs-an-lf-copy $([ "$rc" = 0 ] && ! grep -q "$(printf '\r')" "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc; the installed copy still has carriage returns"
    # timeout: a CRLF copy makes git fail to exec the hook, and the push then HANGS
    # rather than failing (reproduced); a probe must never be able to hang verify.sh.
    out="$(cd "$PUB" && with_timeout 20 git push origin crlf 2>&1 </dev/null)"; rc=$?
    check INST crlf-source-copy-pushes-normally $([ "$rc" = 0 ] && [ "$(git -C "$BARE" rev-parse refs/heads/crlf 2>/dev/null)" = "$(git -C "$PUB" rev-parse HEAD)" ] && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | tail -1 | cut -c1-140)"

    # A re-run from an OLDER worktree must not downgrade the one clone-wide copy.
    # The old hook still carries the marker but does nothing. (Its hook is not
    # origin/main's, so this is also refused for that reason; the copy is untouched.)
    inst_new
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1
    cp "$GATE/pre-push" "$W/good-copy"
    git -C "$PUB" worktree add -q -b oldwt "$FX/oldwt" "$A0" 2>/dev/null
    mkdir -p "$FX/oldwt/.githooks"
    printf '#!/bin/sh\n# roastlogs-push-gate v1\nexit 0\n' > "$FX/oldwt/.githooks/pre-push"
    git -C "$FX/oldwt" add .githooks/pre-push && git -C "$FX/oldwt" commit -q -m "an older, weaker hook"
    out="$(cd "$FX/oldwt" && bash "$INSTALLER" 2>&1)"; rc=$?
    check INST worktree-rerun-does-not-downgrade $(cmp -s "$W/good-copy" "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc; the clone-wide copy was changed by a run from an older worktree"
    # The main checkout's rerun is a legitimate no-op / refresh.
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST main-checkout-rerun-still-works $([ "$rc" = 0 ] && cmp -s "$W/good-copy" "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc"

    # The worktree rule itself: the copy on disk differs from the source (origin/main
    # moved on), the worktree's own hook IS origin/main's (so no confirmation gets in
    # the way), and still only the MAIN checkout may replace a copy.
    inst_new
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1
    cp "$GATE/pre-push" "$W/good-copy"
    printf '# a newer hook, merged\n' >> "$PUB/.githooks/pre-push"
    git -C "$PUB" commit -q -am "newer hook"
    fx_origin_main_to_head
    git -C "$PUB" worktree add -q -b newwt "$FX/newwt" refs/remotes/origin/main 2>/dev/null
    out="$(cd "$FX/newwt" && bash "$INSTALLER" 2>&1)"; rc=$?
    check INST worktree-cannot-replace-a-different-copy $([ "$rc" != 0 ] && cmp -s "$W/good-copy" "$GATE/pre-push" && printf '%s' "$out" | grep -qi 'main checkout' && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-200)"
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check INST main-checkout-may-replace-it $([ "$rc" = 0 ] && ! cmp -s "$W/good-copy" "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc"

    # What is about to be installed is shown, and compared with origin/main: the branch,
    # and "hook identical to origin/main: yes|NO". When origin/main HAS the hook it is the
    # source, installed without a terminal: the line and the diffstat are information. Only
    # the pre-merge bootstrap (origin/main has no hook, so the branch's is installed) needs
    # a typed confirmation, and refuses a run with no terminal.
    inst_new
    out="$(cd "$PUB" && bash "$INSTALLER" 2>&1)"; rc=$?
    check INST reports-the-branch-and-identical-yes $([ "$rc" = 0 ] && printf '%s' "$out" | grep -q 'hook identical to origin/main: yes' && printf '%s' "$out" | grep -q "branch $(git -C "$PUB" rev-parse --abbrev-ref HEAD)" && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | head -4 | tr '\n' ' ' | cut -c1-200)"

    inst_new
    printf '# a hook only this branch has\n' >> "$PUB/.githooks/pre-push"
    git -C "$PUB" commit -q -am "branch-only hook change"
    out="$(cd "$PUB" && bash "$INSTALLER" </dev/null 2>&1)"; rc=$?
    check INST a-differing-branch-hook-installs-origin-mains-without-a-terminal $([ "$rc" = 0 ] && [ -x "$GATE/pre-push" ] && git -C "$PUB" show refs/remotes/origin/main:.githooks/pre-push | cmp -s - "$GATE/pre-push" && ! grep -q 'a hook only this branch has' "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | tail -2 | tr '\n' ' ' | cut -c1-200)"
    printf '%s' "$out" | grep -q 'hook identical to origin/main: NO'
    check INST differing-hook-is-reported-as-NO $? "no 'hook identical to origin/main: NO' line"
    printf '%s' "$out" | grep -q 'changed'
    check INST differing-hook-shows-a-diffstat $? "no diffstat (a 'changed' summary) for a hook that differs from origin/main"
    ! printf '%s' "$out" | grep -qi 'not identical to origin/main.*origin/main'
    check INST differing-hook-message-does-not-contradict-itself $? "the output still says the hook to install is not identical to origin/main's while installing origin/main's"

    # The claude.ai Setup-script route: a fresh clone, on a branch that PREDATES the gate (no
    # hook in its tree at all), with no terminal. origin/main has the hook, so it installs.
    inst_new
    git -C "$PUB" checkout -q -b old-branch "$A0"
    out="$(cd "$PUB" && bash "$INSTALLER" </dev/null 2>&1)"; rc=$?
    check INST a-branch-that-predates-the-gate-installs-without-a-terminal $([ "$rc" = 0 ] && [ -x "$GATE/pre-push" ] && git -C "$PUB" show refs/remotes/origin/main:.githooks/pre-push | cmp -s - "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | tail -2 | tr '\n' ' ' | cut -c1-200)"

    # Bootstrap: origin/main has no hook yet (the gate has not been merged). The branch's
    # hook would be installed, so a typed confirmation is needed and a run with no terminal
    # is refused (a piped "yes" is not a terminal either).
    inst_new; fx_origin_main_gone
    out="$(cd "$PUB" && bash "$INSTALLER" </dev/null 2>&1)"; rc=$?
    check INST bootstrap-without-a-terminal-is-refused $([ "$rc" != 0 ] && [ ! -e "$GATE/pre-push" ] && echo 0 || echo 1) "rc=$rc"
    printf '%s' "$out" | grep -q 'after the gate reaches origin/main'
    check INST bootstrap-says-to-install-after-the-gate-reaches-origin-main $? "the refusal does not say 'install after the gate reaches origin/main': $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-200)"
    out="$(cd "$PUB" && printf 'install\n' | bash "$INSTALLER" 2>&1)"; rc=$?
    check INST bootstrap-a-piped-confirmation-without-a-terminal-is-refused $([ "$rc" != 0 ] && [ ! -e "$GATE/pre-push" ] && echo 0 || echo 1) "rc=$rc"
    if ! sim_skip INST installer-confirmation-prompt "python3 pty is not available on Windows"; then
      inst_pty "$PUB" nope; rc=$RC
      check INST bootstrap-wrong-confirmation-installs-nothing $([ "$rc" != 0 ] && [ ! -e "$GATE/pre-push" ] && echo 0 || echo 1) "rc=$rc"
      inst_pty "$PUB" install; rc=$RC
      check INST bootstrap-typed-confirmation-installs-the-branch-hook $([ "$rc" = 0 ] && [ -x "$GATE/pre-push" ] && git -C "$PUB" show HEAD:.githooks/pre-push | cmp -s - "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$OUT" | tail -3 | tr '\n' ' ' | cut -c1-200)"
    fi

    # The same for a FIRST install from a linked worktree whose hook differs: origin/main's
    # is installed without a terminal.
    inst_new; fx_worktree
    git -C "$WT" checkout -q -b wtgate refs/remotes/origin/main 2>/dev/null
    printf '# worktree-only hook\n' >> "$WT/.githooks/pre-push"
    git -C "$WT" commit -q -am "worktree-only hook"
    out="$(cd "$WT" && bash "$INSTALLER" </dev/null 2>&1)"; rc=$?
    check INST first-install-from-a-worktree-with-a-different-hook-installs-origin-mains $([ "$rc" = 0 ] && [ -x "$GATE/pre-push" ] && git -C "$PUB" show refs/remotes/origin/main:.githooks/pre-push | cmp -s - "$GATE/pre-push" && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | tail -2 | tr '\n' ' ' | cut -c1-200)"

    # core.hooksPath set in the GLOBAL config: unsetting the local key does nothing,
    # so the refusal must say where it is really set.
    inst_new
    printf '[core]\n\thooksPath = %s\n' "$W/somewhere-else" > "$W/global.gitconfig"
    out="$(cd "$PUB" && GIT_CONFIG_GLOBAL="$W/global.gitconfig" bash "$INSTALLER" 2>&1)"; rc=$?
    check INST global-hooks-path-is-refused $([ "$rc" != 0 ] && echo 0 || echo 1) "rc=$rc; a hooksPath from the global config was overwritten"
    printf '%s' "$out" | grep -qF 'git config --show-origin --get core.hooksPath'
    check INST global-refusal-points-at-show-origin $? "the refusal does not say to run: git config --show-origin --get core.hooksPath ($(printf '%s' "$out" | tr '\n' ' ' | cut -c1-200))"
    printf '%s' "$out" | grep -qi 'every repo'
    check INST global-refusal-warns-that-unsetting-it-affects-every-repo $? "the refusal does not warn that unsetting a global key changes every repository"
    printf '%s' "$out" | grep -q -- '--force'
    check INST global-refusal-offers-the-local-override $? "the refusal does not offer --force to set this clone's own key over the global one"
    # --force sets the LOCAL key over a global one, and leaves the global file alone.
    out="$(cd "$PUB" && GIT_CONFIG_GLOBAL="$W/global.gitconfig" bash "$INSTALLER" --force 2>&1)"; rc=$?
    check INST force-sets-the-local-key-over-a-global-one $([ "$rc" = 0 ] && sd "$(git -C "$PUB" config --local --get core.hooksPath)" "$GATE" && grep -q somewhere-else "$W/global.gitconfig" && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | tail -2 | tr '\n' ' ' | cut -c1-200)"
    # ... but a LOCAL key that is something else is still refused, force or not.
    inst_new; git -C "$PUB" config core.hooksPath other-hooks
    (cd "$PUB" && bash "$INSTALLER" --force) >/dev/null 2>&1; rc=$?
    check INST force-does-not-override-a-different-local-key $([ "$rc" != 0 ] && [ "$(git -C "$PUB" config --get core.hooksPath)" = other-hooks ] && echo 0 || echo 1) "rc=$rc"
  fi
fi

# =============================================================================
# WIN (installer side): the same directory in another spelling is the same
# install. Git Bash stores C:/Users/... for what was written as /c/Users/...,
# so comparing the two as strings reads its own install as "a different path".
# The guard and session-start halves of WIN are above and in WIRE.
# =============================================================================
if want_tag WIN; then
  if [ "$MODE" = baseline ]; then
    record WIN installer-spellings SKIP "no installer at the baseline revision"
  elif [ "$ON_WINDOWS" -eq 1 ]; then
    record WIN installer-spellings SKIP "Linux-simulated drive letters and a fake cygpath; the real thing is what runs here"
  else
    inst_new
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1
    git -C "$PUB" config core.hooksPath "$GATE/../push-gate"
    out="$(cd "$PUB" && bash "$INSTALLER" 2>&1)"; rc=$?
    check WIN installer-same-dir-in-another-spelling-is-already-installed $([ "$rc" = 0 ] && printf '%s' "$out" | grep -q 'already installed' && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | head -1 | cut -c1-140)"

    # A stand-in for MSYS cygpath: -m turns /x/y into C:/x/y, -u turns C:/x/y into /x/y.
    mkdir -p "$W/fakebin"
    cat > "$W/fakebin/cygpath" <<'EOF'
#!/bin/sh
case "$1" in
  -m) case "$2" in /*) printf 'C:%s\n' "$2" ;; *) printf '%s\n' "$2" ;; esac ;;
  -u) printf '%s\n' "$2" | sed 's|^[A-Za-z]:||' ;;
  *) printf '%s\n' "$1" ;;
esac
EOF
    chmod 755 "$W/fakebin/cygpath"
    inst_new
    (cd "$PUB" && PATH="$W/fakebin:$PATH" bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    got="$(git -C "$PUB" config --get core.hooksPath)"
    check WIN installer-writes-the-drive-letter-form-when-cygpath-exists $([ "$rc" = 0 ] && [ "$got" = "C:$GATE" ] && echo 0 || echo 1) "rc=$rc hooksPath='$got' (wanted 'C:$GATE')"
    out="$(cd "$PUB" && PATH="$W/fakebin:$PATH" bash "$INSTALLER" 2>&1)"; rc=$?
    check WIN installer-reads-its-own-drive-letter-path-as-installed $([ "$rc" = 0 ] && printf '%s' "$out" | grep -q 'already installed' && [ "$(git -C "$PUB" config --get core.hooksPath)" = "C:$GATE" ] && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | head -1 | cut -c1-140)"
    # The copy directory is gone (deleted by hand) but core.hooksPath still names it
    # in drive-letter form: that is still this clone's install, so it is recreated.
    # With the directory missing there is no file to compare, so only the cygpath
    # spelling can say these are the same place.
    inst_new
    git -C "$PUB" config core.hooksPath "C:$GATE"
    out="$(cd "$PUB" && PATH="$W/fakebin:$PATH" bash "$INSTALLER" 2>&1)"; rc=$?
    check WIN installer-recognises-a-drive-letter-path-to-a-missing-copy $([ "$rc" = 0 ] && printf '%s' "$out" | grep -q 'already installed' && [ -x "$GATE/pre-push" ] && echo 0 || echo 1) "rc=$rc: $(printf '%s' "$out" | head -1 | cut -c1-140)"
    inst_new
    git -C "$PUB" config core.hooksPath "C:/somewhere/else"
    (cd "$PUB" && PATH="$W/fakebin:$PATH" bash "$INSTALLER") >/dev/null 2>&1; rc=$?
    check WIN installer-still-refuses-a-different-drive-letter-path $([ "$rc" != 0 ] && [ "$(git -C "$PUB" config --get core.hooksPath)" = "C:/somewhere/else" ] && echo 0 || echo 1) "rc=$rc"
  fi
fi

# =============================================================================
# WIRE: session-start warning and verify.sh step.
# =============================================================================
session_out() { # -> briefing text for the fixture in $PUB
  CLAUDE_PROJECT_DIR="$PUB" RL_NO_NET=1 bash "$REPO/.claude/hooks/session-start.sh" 2>/dev/null
}
if want_tag WIRE; then
  if [ "$MODE" = baseline ]; then
    record WIRE session-start-and-verify SKIP "wiring is part of the change under test, not the baseline"
  else
    inst_new
    before="$(git -C "$PUB" config --get core.hooksPath; echo $?)"
    session_out | grep -q 'push gate: NOT installed'; rc=$?
    after="$(git -C "$PUB" config --get core.hooksPath; echo $?)"
    check WIRE session-start-warns-when-unset $rc "no 'push gate: NOT installed' line with core.hooksPath unset"
    check WIRE session-start-never-changes-the-setting $([ "$before" = "$after" ] && echo 0 || echo 1) "hooksPath before='$before' after='$after'"
    git -C "$PUB" config core.hooksPath .githooks
    session_out | grep -q 'push gate: NOT installed'; rc=$?
    check WIRE session-start-warns-when-relative $([ $rc -eq 0 ] && echo 0 || echo 1) "a relative core.hooksPath was not flagged"
    git -C "$PUB" config --unset core.hooksPath
    mkdir -p "$W/nomarker"; printf '#!/bin/sh\nexit 0\n' > "$W/nomarker/pre-push"; chmod 755 "$W/nomarker/pre-push"
    git -C "$PUB" config core.hooksPath "$W/nomarker"
    session_out | grep -q 'push gate: NOT installed'; rc=$?
    check WIRE session-start-warns-when-hook-lacks-marker $([ $rc -eq 0 ] && echo 0 || echo 1) "a hooksPath without the marker hook was not flagged"
    git -C "$PUB" config --unset core.hooksPath
    (cd "$PUB" && bash "$INSTALLER") >/dev/null 2>&1
    session_out | grep -q 'push gate: NOT installed'; rc=$?
    check WIRE session-start-quiet-once-installed $([ $rc -ne 0 ] && echo 0 || echo 1) "still warns after the installer ran"
    # The briefing always shows the EFFECTIVE core.hooksPath, so a value that quietly
    # turns the hook off (/dev/null) is obvious at a glance instead of being a path
    # that merely "exists".
    session_out | grep -qF "push gate: core.hooksPath = $(git -C "$PUB" config --get core.hooksPath)"; rc=$?
    check WIRE session-start-prints-the-effective-hooks-path $rc "the briefing has no 'push gate: core.hooksPath = <value>' line"
    git -C "$PUB" config --unset core.hooksPath
    session_out | grep -qF 'push gate: core.hooksPath = (unset)'; rc=$?
    check WIRE session-start-says-unset-when-it-is-unset $rc "the briefing does not say 'push gate: core.hooksPath = (unset)'"
    git -C "$PUB" config core.hooksPath /dev/null
    session_out | grep -qF 'push gate: core.hooksPath = /dev/null'; rc=$?
    check WIRE session-start-shows-a-hooks-path-of-dev-null $rc "the briefing does not show 'push gate: core.hooksPath = /dev/null'"
    session_out | grep -q 'push gate: NOT installed'; rc=$?
    check WIRE session-start-flags-a-hooks-path-of-dev-null $([ $rc -eq 0 ] && echo 0 || echo 1) "a core.hooksPath of /dev/null was not flagged as not installed"
    git -C "$PUB" config --unset core.hooksPath
    # verify.sh runs the push gate step by its SCRIPT, not by a step number that goes
    # stale the day a seventh step is added; a failing step fails verify.sh; and it
    # runs BEFORE the build, so a gate failure does not throw away a finished build
    # and browser run.
    grep -qE 'if ! bash \.claude/tools/verify-push-gate\.sh' "$REPO/.claude/hooks/verify.sh"; rc=$?
    check WIRE verify-sh-fails-when-the-push-gate-step-fails $rc "verify.sh does not stop when .claude/tools/verify-push-gate.sh fails"
    GATE_LN="$(grep -n 'verify-push-gate\.sh' "$REPO/.claude/hooks/verify.sh" | head -1 | cut -d: -f1)"
    BUILD_LN="$(grep -n 'npm run build' "$REPO/.claude/hooks/verify.sh" | head -1 | cut -d: -f1)"
    check WIRE verify-sh-runs-the-push-gate-before-the-build $([ -n "$GATE_LN" ] && [ -n "$BUILD_LN" ] && [ "$GATE_LN" -lt "$BUILD_LN" ] && echo 0 || echo 1) "the push gate step is at line ${GATE_LN:-none}, the build at line ${BUILD_LN:-none}"
    ! grep -qE '^[[:space:]]*(if ! )?bash \.claude/tools/test-push-gate\.sh' "$REPO/.claude/hooks/verify.sh"
    check WIRE verify-sh-does-not-run-the-harness-itself $? "verify.sh still calls the harness directly, which skips the unchanged-gate cache"
    # The DOC probes lint wording, so they stay OUT of the commit gate: a reworded
    # sentence in a document must not fail verify.sh under the label "push gate".
    grep -E 'bash "?\$HARNESS"? .*--exclude[ =]DOC' "$REPO/.claude/tools/verify-push-gate.sh" >/dev/null; rc=$?
    check WIRE verify-push-gate-excludes-the-doc-probes $rc "verify-push-gate.sh does not run the harness with --exclude DOC"
    # Line endings. A CRLF hook does not parse under sh, and a Windows checkout with
    # autocrlf would otherwise write one.
    ATTR="$(git -C "$REPO" check-attr text eol -- .githooks/pre-push .claude/hooks/verify.sh .claude/tools/install-push-gate.sh 2>/dev/null)"
    [ "$(printf '%s\n' "$ATTR" | grep -c 'eol: lf')" -eq 3 ] && [ "$(printf '%s\n' "$ATTR" | grep -c 'text: set')" -eq 3 ]
    check WIRE gitattributes-pin-the-hook-and-the-scripts-to-lf $? "git check-attr does not report text + eol=lf for .githooks/* and *.sh: $(printf '%s' "$ATTR" | tr '\n' ' ' | cut -c1-200)"

    # The briefing asks Case to run the installer; it does not tell the session to.
    inst_new
    session_out | grep -q 'Ask Case to run: bash .claude/tools/install-push-gate.sh'; rc=$?
    check WIRE session-start-asks-case-to-run-the-installer $rc "the warning does not say 'Ask Case to run: bash .claude/tools/install-push-gate.sh'"

    # state-hash: the four gate files, and only those out of .claude/, are hashed,
    # so an edit to the gate cannot be committed against a stale proof.
    HF="$W/hashfx"; mkdir -p "$HF"
    (cd "$HF" && git init -q && git -C "$HF" config user.email f@example.invalid && git -C "$HF" config user.name f \
      && mkdir -p src e2e public .claude/hooks .claude/tools .githooks \
      && printf '{}' > package.json && printf 'x' > playwright.config.js \
      && for f in .githooks/pre-push .claude/hooks/pre-push-guard.sh .claude/tools/test-push-gate.sh .claude/tools/install-push-gate.sh .claude/hooks/verify.sh .claude/hooks/session-start.sh .claude/tools/ledger.js; do printf 'v1\n' > "$f"; done \
      && git add -A && git commit -q -m fixture) >/dev/null 2>&1
    hash_now() { CLAUDE_PROJECT_DIR="$HF" bash "$REPO/.claude/hooks/state-hash.sh" 2>/dev/null; }
    H0="$(hash_now)"
    for f in .githooks/pre-push .claude/hooks/pre-push-guard.sh .claude/tools/test-push-gate.sh .claude/tools/install-push-gate.sh; do
      printf 'edit\n' >> "$HF/$f"; H1="$(hash_now)"
      check WIRE "state-hash-covers-$(basename "$f")" $([ -n "$H0" ] && [ "$H1" != "$H0" ] && echo 0 || echo 1) "editing $f left the state hash unchanged"
      H0="$H1"
    done
    for f in .claude/hooks/verify.sh .claude/hooks/session-start.sh .claude/tools/ledger.js; do
      printf 'edit\n' >> "$HF/$f"; H1="$(hash_now)"
      check WIRE "state-hash-ignores-$(basename "$f")" $([ "$H1" = "$H0" ] && echo 0 || echo 1) "editing $f changed the state hash; only the four gate files should be in scope"
    done
  fi
fi


# =============================================================================
# CACHE: verify-push-gate.sh, the verify.sh step that runs this harness. It skips the
# (minutes-long) run when the gate files, this harness and git itself are unchanged
# since the last PASS, and must never let a stale pass hide a change or a failure.
# The harness it calls is a stub here: that is the thing under test.
# =============================================================================
if want_tag CACHE; then
  if [ "$MODE" = baseline ]; then
    record CACHE verify-push-gate SKIP "no such script at the baseline revision"
  else
    VPG="$REPO/.claude/tools/verify-push-gate.sh"
    CF="$W/cachefx"; rm -rf "$CF"
    mkdir -p "$CF/.claude/tools" "$CF/.claude/hooks" "$CF/.githooks"
    cp "$VPG" "$CF/.claude/tools/verify-push-gate.sh"
    for f in .githooks/pre-push .claude/hooks/pre-push-guard.sh .claude/tools/install-push-gate.sh .gitattributes \
             .claude/hooks/session-start.sh .claude/hooks/state-hash.sh .claude/hooks/verify.sh .claude/hooks/pre-commit-guard.sh; do
      printf 'v1\n' > "$CF/$f"
    done
    CRUNS="$W/cache-runs"; : > "$CRUNS"
    # A stub harness: logs its arguments, exits with $STUB_RC (default 0).
    printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s"\nexit ${STUB_RC:-0}\n' "$CRUNS" > "$CF/.claude/tools/test-push-gate.sh"
    cache_run() { OUT="$(cd "$CF" && CLAUDE_PROJECT_DIR="$CF" bash .claude/tools/verify-push-gate.sh 2>&1)"; RC=$?; }
    nruns() { wc -l < "$CRUNS" | tr -d ' '; }

    cache_run
    check CACHE first-run-runs-the-harness $([ "$RC" = 0 ] && [ "$(nruns)" = 1 ] && [ -s "$CF/.session/push-gate-verified" ] && echo 0 || echo 1) "rc=$RC runs=$(nruns)"
    grep -qE -- '--quiet' "$CRUNS" && grep -qE -- '--exclude DOC' "$CRUNS"
    check CACHE harness-is-run-quiet-and-without-the-doc-probes $? "the harness was run as: $(head -1 "$CRUNS")"
    cache_run
    check CACHE unchanged-gate-skips-the-harness $([ "$RC" = 0 ] && [ "$(nruns)" = 1 ] && echo 0 || echo 1) "rc=$RC runs=$(nruns) (wanted 1)"
    printf '%s' "$OUT" | grep -qi 'unchanged'
    check CACHE skip-prints-a-note $? "the skip said nothing: $(printf '%s' "$OUT" | head -2 | tr '\n' ' ')"
    # Every file the non-DOC probes read is part of the key: the four gate files, the
    # attributes, the wiring the WIRE/CACHE probes check, and this script itself.
    for f in .claude/hooks/pre-push-guard.sh .githooks/pre-push .claude/tools/install-push-gate.sh .claude/tools/test-push-gate.sh .gitattributes \
             .claude/hooks/session-start.sh .claude/hooks/state-hash.sh .claude/hooks/verify.sh .claude/hooks/pre-commit-guard.sh .claude/tools/verify-push-gate.sh; do
      before="$(nruns)"
      printf '# edit\n' >> "$CF/$f"
      cache_run
      check CACHE "editing-$(basename "$f")-runs-the-harness-again" $([ "$RC" = 0 ] && [ "$(nruns)" = $((before + 1)) ] && echo 0 || echo 1) "rc=$RC runs=$(nruns) (wanted $((before + 1)))"
    done
    # A failing harness fails the step, whatever the cache said.
    printf '# edit\n' >> "$CF/.githooks/pre-push"
    before="$(nruns)"
    (cd "$CF" && STUB_RC=1 CLAUDE_PROJECT_DIR="$CF" bash .claude/tools/verify-push-gate.sh) >/dev/null 2>&1; rc=$?
    check CACHE failing-harness-fails-the-step $([ "$rc" != 0 ] && [ "$(nruns)" = $((before + 1)) ] && echo 0 || echo 1) "rc=$rc"
    [ ! -e "$CF/.session/push-gate-verified" ]
    check CACHE a-failure-leaves-no-pass-behind $? "the cache file survived a failing run"
    (cd "$CF" && STUB_RC=1 CLAUDE_PROJECT_DIR="$CF" bash .claude/tools/verify-push-gate.sh) >/dev/null 2>&1; rc=$?
    check CACHE the-same-failure-fails-again-not-skipped $([ "$rc" != 0 ] && [ "$(nruns)" = $((before + 2)) ] && echo 0 || echo 1) "rc=$rc runs=$(nruns)"
    # A stale PASS cannot mask a change: pass, then change a gate file AND break the harness.
    cache_run
    before="$(nruns)"
    printf '# a weakening\n' >> "$CF/.claude/hooks/pre-push-guard.sh"
    (cd "$CF" && STUB_RC=1 CLAUDE_PROJECT_DIR="$CF" bash .claude/tools/verify-push-gate.sh) >/dev/null 2>&1; rc=$?
    check CACHE a-stale-pass-cannot-mask-a-changed-gate-file $([ "$rc" != 0 ] && [ "$(nruns)" = $((before + 1)) ] && echo 0 || echo 1) "rc=$rc: the changed guard was waved through on an old pass"
    # An explicit override runs it regardless.
    cache_run; before="$(nruns)"
    (cd "$CF" && PUSH_GATE_FORCE=1 CLAUDE_PROJECT_DIR="$CF" bash .claude/tools/verify-push-gate.sh) >/dev/null 2>&1; rc=$?
    check CACHE force-runs-it-anyway $([ "$rc" = 0 ] && [ "$(nruns)" = $((before + 1)) ] && echo 0 || echo 1) "rc=$rc runs=$(nruns)"
    # A different git changes the hash too (the harness exercises git itself).
    mkdir -p "$W/fakegit"; printf '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version 0.0.0-fake"; else exec %s "$@"; fi\n' "$(command -v git)" > "$W/fakegit/git"; chmod 755 "$W/fakegit/git"
    cache_run; before="$(nruns)"
    (cd "$CF" && PATH="$W/fakegit:$PATH" CLAUDE_PROJECT_DIR="$CF" bash .claude/tools/verify-push-gate.sh) >/dev/null 2>&1; rc=$?
    check CACHE a-different-git-version-runs-it-again $([ "$rc" = 0 ] && [ "$(nruns)" = $((before + 1)) ] && echo 0 || echo 1) "rc=$rc runs=$(nruns)"
    # A missing harness fails (a gate that quietly passes without its checks is not a gate).
    rm -f "$CF/.claude/tools/test-push-gate.sh"
    (cd "$CF" && CLAUDE_PROJECT_DIR="$CF" bash .claude/tools/verify-push-gate.sh) >/dev/null 2>&1; rc=$?
    check CACHE a-missing-harness-fails-the-step $([ "$rc" != 0 ] && echo 0 || echo 1) "rc=$rc"
  fi
fi

# =============================================================================
# WIN / COPY (session-start side): the same classification the guard makes.
# =============================================================================
if want_tag WIN || want_tag COPY; then
  if [ "$MODE" = baseline ]; then
    record WIN session-start-paths SKIP "wiring is part of the change under test, not the baseline"
  else
    warns() { session_out | grep -q "push gate: $1"; }   # NOT installed | STALE
    # WIN: every spelling Git Bash produces is absolute; "C:gate" is not. (SKIP on
    # Windows: the Linux fixtures place the hook under a RELATIVE "C:" directory.)
    for spec in "fwd:p_win_fwd" "lower:p_win_fwd_lower" "backslash:p_win_back"; do
      want_tag WIN || break
      sim_skip WIN "session-start-accepts-a-drive-letter-path-${spec%%:*}" && continue
      fx_new; "${spec#*:}"
      warns 'NOT installed'; rc=$?
      check WIN "session-start-accepts-a-drive-letter-path-${spec%%:*}" $([ $rc -ne 0 ] && echo 0 || echo 1) "session-start flags a drive-letter core.hooksPath as not installed"
    done
    if want_tag WIN && ! sim_skip WIN session-start-flags-a-drive-relative-path; then
      fx_new; p_win_driverel
      warns 'NOT installed'; rc=$?
      check WIN session-start-flags-a-drive-relative-path $rc "C:gate was accepted as an absolute path"
    fi
    # COPY: missing, edited, and nothing-to-compare-with.
    if want_tag COPY; then
      fx_new; p_copy_deleted
      warns 'NOT installed'; rc=$?
      check COPY session-start-warns-when-the-copy-is-missing $rc "no 'push gate: NOT installed' line with the installed copy deleted"
      fx_new; p_copy_edited
      warns 'STALE'; rc=$?
      check COPY session-start-warns-when-the-copy-is-stale $rc "no 'push gate: STALE' line with an edited copy"
      session_out | grep 'push gate: STALE' | grep -q 'Ask Case to re-run: bash .claude/tools/install-push-gate.sh'; rc=$?
      check COPY session-start-stale-line-asks-case-to-re-run-the-installer $rc "the STALE line does not say 'Ask Case to re-run: bash .claude/tools/install-push-gate.sh'"
      fx_new; p_installed
      warns 'STALE'; rc1=$?; warns 'NOT installed'; rc2=$?
      check COPY session-start-is-quiet-for-a-fresh-copy $([ $rc1 -ne 0 ] && [ $rc2 -ne 0 ] && echo 0 || echo 1) "a freshly installed copy produced a push-gate warning"
      fx_new; p_installed; rm -f "$PUB/.githooks/pre-push"
      warns 'STALE'; rc1=$?; warns 'NOT installed'; rc2=$?
      check COPY session-start-has-no-stale-check-without-a-source-hook $([ $rc1 -ne 0 ] && [ $rc2 -ne 0 ] && echo 0 || echo 1) "a checkout with no .githooks/pre-push produced a push-gate warning"
    fi
  fi
fi

# =============================================================================
# DOC: the written instructions say what the gate now does. These are greps on
# purpose: the failure they catch is a sentence that sends Case or Claude down a
# route the gate no longer allows (or offers --no-verify for the wrong case).
# =============================================================================
flat_text() { tr '\n' ' ' < "$1" | tr -s ' '; }  # a file as one line, for sentences that wrap
if want_tag DOC; then
  if [ "$MODE" = baseline ]; then
    record DOC instructions SKIP "the instructions are part of the change under test, not the baseline"
  else
    SK="$REPO/.claude/skills/release/SKILL.md"
    PR="$REPO/.claude/commands/publish-review.md"
    PA="$REPO/.claude/agents/publication-reviewer.md"
    CM="$REPO/CLAUDE.md"

    # Two different situations, two different answers. A clearance that is NOT
    # granted is fixed by changing the commits; --no-verify is never the answer to
    # it. Only a gate that itself misfires can be skipped, and only by Case.
    flat_text "$SK" | grep -qE 'NOT clear.{0,240}re-run [^a-z]?/publish-review[^a-z]?.{0,120}never offer [^a-z-]?--no-verify'
    check DOC release-skill-not-clear-means-fix-and-never-offer-no-verify $? "release SKILL.md does not say: review NOT clear -> fix, re-run /publish-review, never offer --no-verify"
    flat_text "$SK" | grep -qE 'gate itself misfires.{0,200}shallow clone.{0,200}tell Case.{0,120}git push --no-verify[^a-z]{0,6}from his own terminal'
    check DOC release-skill-gate-misfire-is-for-case-and-his-own-terminal $? "release SKILL.md does not say: the gate itself misfires (shallow clone ...) -> tell Case, who may use git push --no-verify from his own terminal"
    ! flat_text "$SK" | grep -q 'With no clearance, stop and ask Case to push'
    check DOC release-skill-no-longer-merges-the-two-cases $? "release SKILL.md still has the sentence that offers --no-verify for a missing clearance"

    # The fetch comes first, so the range is resolved from a fresh origin.
    FIRST="$(awk '/^```bash/ { f = 1; next } f { print; exit }' "$PR")"
    check DOC publish-review-block-starts-with-git-fetch $([ "$FIRST" = 'git fetch --quiet' ] && echo 0 || echo 1) "the first line of publish-review.md's range block is '${FIRST}', not 'git fetch --quiet'"
    NOTE_LN="$(grep -n 'do not fetch' "$PA" | head -1 | cut -d: -f1)"
    FENCE_LN="$(grep -n '^```bash' "$PA" | head -1 | cut -d: -f1)"
    check DOC reviewer-fetch-note-comes-before-the-range-block $([ -n "$NOTE_LN" ] && [ -n "$FENCE_LN" ] && [ "$NOTE_LN" -lt "$FENCE_LN" ] && echo 0 || echo 1) "the fetch note is at line ${NOTE_LN:-none}, the range block opens at line ${FENCE_LN:-none}"

    # CLAUDE.md: a short Push gate block, with the rollback and no private detail.
    BLOCK="$(awk '/^### Push gate/ { f = 1; print; next } f && /^#/ { exit } f { print }' "$CM")"
    check DOC claude-md-has-a-push-gate-block $([ -n "$BLOCK" ] && echo 0 || echo 1) "CLAUDE.md has no '### Push gate' block"
    for want in 'bash .claude/tools/install-push-gate.sh' 'git push --no-verify' 'git config --unset core.hooksPath' 'worktree' 'pre-push-guard.sh'; do
      label="$(printf '%s' "$want" | tr -c 'A-Za-z0-9' '-' | cut -c1-40)"
      printf '%s' "$BLOCK" | grep -qF -- "$want"; rc=$?   # before any substitution can reset $?
      check DOC "claude-md-push-gate-mentions-$label" $rc "the Push gate block does not mention '$want'"
    done
    printf '%s' "$BLOCK" | grep -qiE 'denied|may not|cannot'
    check DOC claude-md-push-gate-says-claude-is-denied-both $? "the Push gate block does not say Claude is denied --no-verify and the config unset"
    [ -n "$BLOCK" ] && ! printf '%s' "$BLOCK" | grep -qE '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|([0-9]{1,3}[.]){3}[0-9]{1,3}'
    check DOC claude-md-push-gate-has-no-email-uuid-or-ip $? "the Push gate block is missing, or contains something shaped like an email, a UUID or an IP address"
    # git grep, not grep -r: only THIS checkout's tracked files are scanned. A recursive
    # grep from the main checkout also walks .claude/worktrees/*, so text on another
    # branch could fail this one. (git grep exits 1 for "no match"; anything else, a
    # 128 for "not a repository" included, is a failure of the probe, not a pass.)

    # A comment in session-start.sh that still claims a rollback "sticks" (wording lint).
    ! grep -qE 'rollback.{0,50}sticks' "$REPO/.claude/hooks/session-start.sh"
    check DOC session-start-does-not-claim-a-rollback-sticks $? "a comment in session-start.sh still says a rollback 'sticks'"

    # Honesty about what each layer does before the installer has run, and about what
    # no client-side check can close.
    printf '%s' "$BLOCK" | grep -qE 'EVERY clone'
    check DOC claude-md-says-to-install-in-every-clone $? "the Push gate block does not say to install in EVERY clone Claude pushes from"
    ! printf '%s' "$BLOCK" | grep -qF "Until it runs, the guard denies Claude's pushes from that clone"
    check DOC claude-md-drops-a-retired-sentence $? "the Push gate block still carries a retired sentence"
    printf '%s' "$BLOCK" | grep -qiE 'ruleset'
    check DOC claude-md-names-the-server-side-ruleset-as-the-full-close $? "the Push gate block does not name the GitHub ruleset on main as the only full close"
    printf '%s' "$BLOCK" | grep -qiE 'main checkout'
    check DOC claude-md-says-to-run-the-installer-from-the-main-checkout $? "the Push gate block does not say to run the installer from the main checkout"
    ! grep -qF 'fires however git was invoked (wrapper, alias, subshell, GIT_DIR)' "$REPO/.githooks/pre-push"
    check DOC hook-header-no-longer-claims-it-fires-however-git-was-invoked $? ".githooks/pre-push still claims it fires however git was invoked, without saying it only runs in an installed clone"
    grep -qF 'for pushes run inside an installed clone' "$REPO/.githooks/pre-push"
    check DOC hook-header-says-it-covers-pushes-inside-an-installed-clone $? ".githooks/pre-push header does not say 'for pushes run inside an installed clone'"
    tr '\n' ' ' < "$REPO/.githooks/pre-push" | tr -s ' #' ' ' | grep -qE 'guard DENIES a copy that matches neither committed version'
    check DOC hook-header-says-the-guard-denies-a-copy-that-matches-no-committed-version $? ".githooks/pre-push header does not say the guard DENIES a copy that matches neither committed version"
    tr '\n' ' ' < "$REPO/.githooks/pre-push" | tr -s ' #' ' ' | grep -qF 'refs/heads/main'
    check DOC hook-header-names-local-main-as-a-known-good-source $? ".githooks/pre-push header does not mention refs/heads/main as an accepted source"

    # Round 3: the framing is a speed bump, said plainly, and nothing is "denied in any form".
    printf '%s' "$BLOCK" | grep -qi 'speed bump'
    check DOC claude-md-calls-the-gate-a-speed-bump $? "the Push gate block does not call the gate a speed bump"
    ! printf '%s' "$BLOCK" | grep -qF 'only has to equal a committed hook'
    check DOC claude-md-drops-only-has-to-equal-a-committed-hook $? "the Push gate block still says the installed copy only has to equal a committed hook"
    ! grep -qiE 'in any form' "$CM" "$REPO/.claude/hooks/pre-push-guard.sh" "$REPO/.claude/tools/install-push-gate.sh" "$REPO/.claude/hooks/session-start.sh"
    check DOC nothing-is-denied-in-any-form $? "a document or hook still says something is denied or refused 'in any form'"
    printf '%s' "$BLOCK" | grep -qi 'common spellings'
    check DOC claude-md-says-the-common-spellings $? "the Push gate block does not say the guard refuses the common spellings"
    # (the phrase is assembled so this very line does not match it)
    PAT='only ever adds'; PAT="$PAT protection"
    git -C "$REPO" grep -qi -e "$PAT" -- CLAUDE.md .claude .githooks >/dev/null 2>&1; rc=$?
    check DOC no-document-says-the-installer-only-ever-adds-protection $([ "$rc" -eq 1 ] && echo 0 || echo 1) "a document still claims the installer cannot weaken anything (the phrase built in PAT above; git grep exit $rc)"
    printf '%s' "$BLOCK" | grep -qF 'Setup script'
    check DOC claude-md-gives-the-claude-ai-setup-script-route $? "the Push gate block does not give the claude.ai Setup script route"
    printf '%s' "$BLOCK" | tr '\n' ' ' | tr -s ' ' | grep -qiE 'has to run after the repo is cloned'
    check DOC claude-md-says-the-setup-script-runs-after-the-clone $? "the Push gate block does not say the Setup script has to run after the repo is cloned"
    printf '%s' "$BLOCK" | grep -qE 'merge, push, THEN install'
    check DOC claude-md-orders-merge-push-then-install $? "the Push gate block does not say: merge, push, THEN install"
    printf '%s' "$BLOCK" | grep -qiE 'delete'
    check DOC claude-md-says-who-may-delete $? "the Push gate block does not say that the guard refuses deletes and the hook lets Case delete"
    ! grep -qE 'Claude cannot override either' "$SK"
    check DOC release-skill-no-longer-says-claude-cannot-override-either $? "release SKILL.md still says Claude cannot override either layer"
    ! grep -q '45-55s' "$REPO/.claude/hooks/pre-commit-guard.sh"
    check DOC pre-commit-guard-no-longer-promises-45-55-seconds $? "pre-commit-guard.sh still says verify takes about 45-55s"
    PAT="~40"; PAT="$PAT s"
    ! grep -qF -e "$PAT" "$REPO/.claude/tools/test-push-gate.sh"
    check DOC harness-no-longer-claims-it-takes-40-seconds $? "the harness still claims a run takes about forty seconds"
  fi
fi

# =============================================================================
# RESID: pinned residual probes. They are kept in the private ops repo, not here: what a
# text guard cannot see is not something to publish. Present only where docs/private is
# cloned; elsewhere they record SKIP. The file is sourced, so it calls decide and record
# exactly as the probes above do.
# =============================================================================
if [ -f "$REPO/docs/private/push-gate-resid.sh" ]; then
  # shellcheck disable=SC1091
  . "$REPO/docs/private/push-gate-resid.sh"
else
  want_tag RESID && record RESID private-probes SKIP "docs/private/push-gate-resid.sh is not here (the private ops repo is not cloned)"
fi

# =============================================================================
# NET: the sandbox cannot reach GitHub, so nothing above could have leaked there.
# =============================================================================
fx_new; p_plain
out="$(cd "$OPS" && git push "$OPSURL" HEAD 2>&1)"; rc=$?
if [ "$rc" != 0 ] && printf '%s' "$out" | grep -q "not allowed"; then
  record NET https-push-is-refused-in-the-sandbox PASS "$(printf '%s' "$out" | grep -m1 'not allowed' | cut -c1-80)"
else
  record NET https-push-is-refused-in-the-sandbox FAIL "expected \"transport 'https' not allowed\", got rc=$rc: $(printf '%s' "$out" | tail -1 | cut -c1-120)"
fi

# SELF: this repo's status, HEAD, refs and local config are what they were.
SNAP_AFTER="$(snapshot_real)"
if [ "$SNAP_BEFORE" = "$SNAP_AFTER" ]; then
  record SELF repo-state-unchanged PASS "porcelain status, HEAD, refs and local config identical"
else
  record SELF repo-state-unchanged FAIL "the repository under test changed during the run"
fi

# --- summary -----------------------------------------------------------------
echo
echo "SUMMARY (guard + hook: $LABEL)"
awk -F'\t' '
  { seen[$1] = 1; if ($2 == "PASS") p[$1]++; else if ($2 == "FAIL") f[$1]++; else s[$1]++ }
  END { for (k in seen) printf "  %-7s pass %-3d fail %-3d skip %d\n", k, p[k], f[k], s[k] }
' "$RESULTS" | sort
NFAIL="$(awk -F'\t' '$2 == "FAIL"' "$RESULTS" | wc -l | tr -d ' ')"
NPASS="$(awk -F'\t' '$2 == "PASS"' "$RESULTS" | wc -l | tr -d ' ')"
if [ "$NFAIL" -gt 0 ]; then
  echo "RESULT: FAIL ($NFAIL failed, $NPASS passed)"
  exit 1
fi
echo "RESULT: PASS ($NPASS passed)"
exit 0
