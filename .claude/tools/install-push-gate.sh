#!/usr/bin/env bash
# Turns the git-native push gate (.githooks/pre-push) on for THIS clone.
#
#   bash .claude/tools/install-push-gate.sh [--force]
#
# Run it yourself (Case), once per clone, on each machine, from the MAIN checkout, AFTER
# the gate has been merged and pushed (merge, push, THEN install: until origin/main
# carries .githooks/pre-push there is nothing reviewed to install). Claude is told to
# ask you to, and the push guard refuses the common spellings of Claude running it: the
# installer decides which hook counts as the gate. (A claude.ai session container is a
# fresh clone every time: add this script to that environment's Setup script, to run
# after the repo is cloned.)
#
# WHAT IT DOES. It COPIES a COMMITTED .githooks/pre-push to <git dir>/push-gate/pre-push,
# with LF line endings, and sets core.hooksPath to the ABSOLUTE path of that directory.
# core.hooksPath is per-clone LOCAL config, shared by every worktree of the clone, so one
# run covers .claude/worktrees/*. Choices that matter:
#   - WHICH hook: origin/main's committed one when it exists (refs/remotes/origin/main,
#     as of the last fetch), else this checkout's HEAD, else the main checkout's HEAD.
#     It prints the branch and `hook identical to origin/main: yes|NO` (with a diffstat
#     when the branch's hook differs). With origin/main's hook as the source that line is
#     INFORMATION ONLY: the merged hook is installed with no terminal and no question,
#     which is what a claude.ai Setup script needs, from whatever branch it starts on.
#     Only the pre-merge bootstrap (origin/main has no hook, so a branch's hook would be
#     installed) REFUSES a run with no terminal and asks for a typed confirmation
#     otherwise, so an unmerged hook is never installed by accident or from a script.
#   - COMMITTED, not the work-tree file: Claude can edit that file freely, and an
#     installer that copied it would turn "refresh the gate" into "install my
#     edit". An uncommitted difference is reported (NOTE), not installed.
#   - ONE copy per clone, so a re-run from an OLDER linked worktree could silently
#     downgrade it for every worktree and for your terminal. It therefore refuses to
#     REPLACE an existing, different copy unless it is run from the main checkout.
#   - LF: a hook with CRLF line endings does not parse under sh, git cannot exec it,
#     and the push then fails (it has been seen to hang). Output is always LF.
#   - ABSOLUTE: a relative path is resolved from the cwd of whoever runs git, so
#     `GIT_DIR=... git push` from another directory would run no hook at all.
#   - A COPY in the git dir, not a path into a work tree: if core.hooksPath pointed
#     at <checkout>/.githooks, checking that checkout out onto a branch with no
#     .githooks/ would leave it pointing at nothing, and git then runs NO hook
#     without saying so. The git dir is outside every work tree.
# After .githooks/pre-push changes: merge it, pull main in the main checkout, and run
# this again to refresh the copy. The push guard denies Claude's pushes when the copy
# matches none of the committed versions (HEAD, origin/main, local main). Every run
# prints the commit it installed from and a cksum of the copy, so a downgrade is visible.
#
# It never overwrites a different hooksPath, and refuses (and says why) rather than
# guess. --force is accepted for two cases only: hooks already sitting in .git/hooks,
# which core.hooksPath would shadow, and a core.hooksPath that comes from the GLOBAL or
# SYSTEM config, where it sets THIS clone's own key over it (the global key stays, for
# every other repository).
#
# WINDOWS (Git Bash). git there reports core.hooksPath as C:/Users/... for what a
# POSIX shell wrote as /c/Users/..., so two spellings of one directory are
# compared by file identity ([ -ef ]) and, when cygpath exists, by its POSIX form.
#
# ROLLBACK, from your own terminal in the clone root (Claude is not allowed to):
#   one push    git push --no-verify ...
#   this clone  git config --unset core.hooksPath
#               git config --get core.hooksPath      (prints nothing, exits 1)

MARKER='roastlogs-push-gate v1'
FORCE=0

die() {
  echo "install-push-gate: $1" >&2
  exit 1
}

for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    -h|--help) awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) die "unknown argument '$a' (only --force)" ;;
  esac
done

# Are two spellings the same directory? Equal strings; or the same file on disk
# (a symlink, a trailing slash, a ..); or, where cygpath exists, the same POSIX
# path (C:/Users/x and /c/Users/x, which a plain string compare calls different).
same_dir() { # A B
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

git rev-parse --git-dir >/dev/null 2>&1 || die "run this from inside the roastlogs clone."
COMMON="$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)"
[ -n "$COMMON" ] || die "cannot resolve the clone's git directory."
GITDIR="$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)"
TOP="$(git rev-parse --show-toplevel 2>/dev/null)"
# The main checkout is the one whose git dir IS the common dir; a linked worktree's
# git dir is <common>/worktrees/<name>.
IN_MAIN=0
[ -n "$GITDIR" ] && [ "$GITDIR" = "$COMMON" ] && IN_MAIN=1

# The hook to install. Read with git show (so a work-tree edit cannot reach the gate),
# written with LF line endings whatever the blob holds. Preference: origin/main's
# committed hook (the merged, reviewed one) when it exists, else the HEAD of this
# checkout, else the HEAD of the main checkout (this one may be a worktree on a branch
# from before the push gate existed). H is the hook this checkout would offer, O is
# origin/main's; the line printed below says whether they are the same.
MAIN=""
[ "$(basename "$COMMON")" = ".git" ] && MAIN="$(dirname "$COMMON")"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/push-gate-install.XXXXXX")" || die "cannot create a temporary directory."
trap 'rm -rf "$SCRATCH"' EXIT
H_OK=0; O_OK=0
H_COMMIT=""; H_FROM=""; O_COMMIT=""
if git cat-file -e "HEAD:.githooks/pre-push" 2>/dev/null; then
  git show "HEAD:.githooks/pre-push" > "$SCRATCH/h.raw" 2>/dev/null || die "could not read HEAD:.githooks/pre-push."
  H_COMMIT="$(git rev-parse --short HEAD 2>/dev/null)"; H_FROM="HEAD of ${TOP:-this checkout}"; H_OK=1
elif [ -n "$MAIN" ] && git -C "$MAIN" cat-file -e "HEAD:.githooks/pre-push" 2>/dev/null; then
  git -C "$MAIN" show "HEAD:.githooks/pre-push" > "$SCRATCH/h.raw" 2>/dev/null || die "could not read HEAD:.githooks/pre-push in $MAIN."
  H_COMMIT="$(git -C "$MAIN" rev-parse --short HEAD 2>/dev/null)"; H_FROM="HEAD of the main checkout ($MAIN)"; H_OK=1
fi
if git cat-file -e "refs/remotes/origin/main:.githooks/pre-push" 2>/dev/null; then
  git show "refs/remotes/origin/main:.githooks/pre-push" > "$SCRATCH/o.raw" 2>/dev/null || die "could not read origin/main:.githooks/pre-push."
  O_COMMIT="$(git rev-parse --short refs/remotes/origin/main 2>/dev/null)"; O_OK=1
fi
[ "$H_OK" -eq 1 ] && tr -d '\r' < "$SCRATCH/h.raw" > "$SCRATCH/h"
[ "$O_OK" -eq 1 ] && tr -d '\r' < "$SCRATCH/o.raw" > "$SCRATCH/o"
SRC="$SCRATCH/pre-push"
if [ "$O_OK" -eq 1 ]; then
  cp "$SCRATCH/o" "$SRC"; SRC_COMMIT="$O_COMMIT"; SRC_FROM="origin/main"
elif [ "$H_OK" -eq 1 ]; then
  cp "$SCRATCH/h" "$SRC"; SRC_COMMIT="$H_COMMIT"; SRC_FROM="$H_FROM"
else
  die "no COMMITTED .githooks/pre-push at origin/main, at HEAD in this checkout${MAIN:+, or in the main checkout ($MAIN)}. Pull main first (this may be a branch that predates the push gate); a file that is only in the work tree is never installed."
fi
grep -q "$MARKER" "$SRC" || die "the committed .githooks/pre-push ($SRC_FROM, $SRC_COMMIT) does not carry the '$MARKER' marker, so it is not the push gate."

# Is the branch's hook the same as origin/main's? Said out loud on every run.
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
IDENT=NO; IDENT_WHY=""
if [ "$O_OK" -eq 1 ] && [ "$H_OK" -eq 1 ] && cmp -s "$SCRATCH/h" "$SCRATCH/o"; then
  IDENT=yes
elif [ "$O_OK" -eq 0 ]; then
  IDENT_WHY="origin/main carries no .githooks/pre-push yet, so there is no merged hook to install: install after the gate reaches origin/main (merge, push, then install). Run git fetch if it should have."
elif [ "$H_OK" -eq 0 ]; then
  IDENT_WHY="this checkout has no committed hook; origin/main's is what gets installed (information only)."
else
  IDENT_WHY="the hook committed on this branch differs from origin/main's; origin/main's is what gets installed (information only)."
fi
echo "push gate: branch ${BRANCH:-unknown}; hook identical to origin/main: ${IDENT}${IDENT_WHY:+ ($IDENT_WHY)}"
if [ "$IDENT" = NO ] && [ "$O_OK" -eq 1 ] && [ "$H_OK" -eq 1 ]; then
  git diff --no-index --stat -- "$SCRATCH/o" "$SCRATCH/h" 2>/dev/null | sed 's/^/    /'
fi

# An uncommitted difference is not installed, and is not silent.
WT_NOTE=""
if [ -n "$TOP" ] && [ -f "$TOP/.githooks/pre-push" ] && [ "$(tr -d '\r' < "$TOP/.githooks/pre-push")" != "$(cat "$SRC")" ]; then
  WT_NOTE="NOTE: $TOP/.githooks/pre-push in the work tree differs from the committed hook ($SRC_FROM, $SRC_COMMIT), so the COMMITTED one is what gets installed. To install the edit, commit and merge it, then re-run this from the main checkout."
fi

DEST="$COMMON/push-gate"
# What goes into the config: the Windows-style form when cygpath says there is one
# (C:/Users/... is what git itself reports), otherwise the path as it is.
DEST_CFG="$DEST"
if command -v cygpath >/dev/null 2>&1; then
  M="$(cygpath -m "$DEST" 2>/dev/null)"
  [ -n "$M" ] && DEST_CFG="$M"
fi

CUR="$(git config --get core.hooksPath 2>/dev/null)"
ALREADY=0   # core.hooksPath is already this clone's copy directory
LEGACY=0    # an earlier layout: core.hooksPath pointed into a work tree's .githooks
if [ -n "$CUR" ]; then
  if same_dir "$CUR" "$DEST"; then
    ALREADY=1
  elif [ "$CUR" = ".githooks" ] || [ "$CUR" = "./.githooks" ] \
    || { [ -n "$TOP" ] && same_dir "$CUR" "$TOP/.githooks"; } \
    || { [ -n "$MAIN" ] && same_dir "$CUR" "$MAIN/.githooks"; }; then
    LEGACY=1
  else
    CUR_ORIGIN="$(git config --show-origin --get core.hooksPath 2>/dev/null | cut -f1)"
    LOCAL_CUR="$(git config --local --get core.hooksPath 2>/dev/null)"
    if [ -z "$LOCAL_CUR" ] && [ "$FORCE" -eq 1 ]; then
      # Not this clone's own key: it comes from the global or system config. A local key
      # overrides it for this clone alone.
      echo "push gate: core.hooksPath ('$CUR'${CUR_ORIGIN:+, from $CUR_ORIGIN}) is not this clone's own setting; --force sets this clone's own key over it. The other config is left alone, and so is every other repository."
    else
      die "core.hooksPath is already set to '$CUR'${CUR_ORIGIN:+ in $CUR_ORIGIN} (not '$DEST_CFG'). Refusing to overwrite it. See where it comes from with: git config --show-origin --get core.hooksPath. If it is stale and it is THIS clone's own key, run git config --unset core.hooksPath, then re-run this. If it is in the global or system config, unsetting it there (git config --global --unset core.hooksPath) changes EVERY repo you have, not just this one; to gate only this clone, re-run this with --force, which sets this clone's own key over it."
    fi
  fi
fi

# core.hooksPath REPLACES .git/hooks, it does not add to it. Not asked again when
# it is already this clone's install (an earlier --force install accepted it), nor
# when moving off the old layout (which shadowed them already).
if [ "$ALREADY" -eq 0 ] && [ "$LEGACY" -eq 0 ]; then
  SHADOWED=""
  if [ -d "$COMMON/hooks" ]; then
    SHADOWED="$(ls "$COMMON/hooks" 2>/dev/null | grep -v '\.sample$')"
  fi
  if [ -n "$SHADOWED" ] && [ "$FORCE" -ne 1 ]; then
    echo "$SHADOWED" | sed 's/^/    /' >&2
    die "the hooks above are in $COMMON/hooks and would stop running once core.hooksPath is set. Look at them, then re-run with --force if that is fine."
  fi
fi

# One copy serves the whole clone (every worktree, and your terminal). Replacing a
# DIFFERENT existing copy from a linked worktree could roll the gate back to whatever
# that worktree's older branch holds, silently, for all of them. Only the main
# checkout may do that. Nothing has been changed yet at this point.
if [ -f "$DEST/pre-push" ] && ! cmp -s "$SRC" "$DEST/pre-push" && [ "$IN_MAIN" -ne 1 ]; then
  die "an installed copy already exists at $DEST/pre-push and it differs from the hook committed here ($SRC_COMMIT). This is a linked worktree, and replacing the one copy every worktree shares from here could downgrade it. Run this from the MAIN checkout${MAIN:+ ($MAIN)} instead. Nothing was changed."
fi

# Only the bootstrap needs asking. With origin/main's hook as the source, what gets installed
# is the merged, reviewed hook whatever this branch holds, so there is nothing to confirm
# (and a Setup script on a fresh clone has no terminal). Without it (origin/main has no
# hook yet) the hook is this checkout's own, which nobody has merged: with no terminal
# there is nobody to ask, so it is refused; with one, a typed word confirms it. Asked only
# when something would actually change (a re-run that finds the copy already current, and
# core.hooksPath already set, changes nothing and asks nothing).
CHANGES=1
if [ "$ALREADY" -eq 1 ] && [ -f "$DEST/pre-push" ] && cmp -s "$SRC" "$DEST/pre-push"; then CHANGES=0; fi
if [ "$O_OK" -eq 0 ] && [ "$CHANGES" -eq 1 ]; then
  if [ ! -t 0 ]; then
    die "origin/main carries no .githooks/pre-push yet, so the hook that would be installed is this checkout's own ($SRC_FROM, $SRC_COMMIT), which nobody has merged, and this run has no terminal to confirm that on; nothing was installed. Install after the gate reaches origin/main (merge, push, then install), or run this from your own terminal and confirm."
  fi
  echo "About to install the UNMERGED hook from $SRC_FROM ($SRC_COMMIT) into $DEST."
  printf 'Type install to continue (anything else stops): '
  read -r ANSWER
  [ "$ANSWER" = install ] || die "not confirmed; nothing was installed."
fi

# Copy, then rename into place, so a hook is never half-written when git looks.
mkdir -p "$DEST" || die "cannot create $DEST."
if [ -f "$DEST/pre-push" ] && cmp -s "$SRC" "$DEST/pre-push"; then
  COPY_NOTE="copy already current"
else
  TMP="$DEST/pre-push.new.$$"
  cp "$SRC" "$TMP" && chmod 755 "$TMP" && mv -f "$TMP" "$DEST/pre-push" || { rm -f "$TMP"; die "could not write $DEST/pre-push."; }
  COPY_NOTE="copy refreshed from the committed hook ($SRC_COMMIT)"
fi
chmod 755 "$DEST/pre-push" 2>/dev/null

if [ "$ALREADY" -eq 1 ]; then
  echo "push gate: already installed (core.hooksPath = $CUR; $COPY_NOTE)"
else
  git config --local core.hooksPath "$DEST_CFG" || die "could not write core.hooksPath."
  if [ "$LEGACY" -eq 1 ]; then
    echo "push gate: moved off the in-work-tree layout ('$CUR'). core.hooksPath = $DEST_CFG ($COPY_NOTE)"
  else
    echo "push gate: installed. core.hooksPath = $DEST_CFG ($COPY_NOTE)"
  fi
fi

# What was installed, every time: the commit it came from and a checksum of the copy,
# so a downgrade (or a copy somebody edited) shows up as a different number.
SUM="$(cksum < "$DEST/pre-push" 2>/dev/null | cut -d' ' -f1)"
BYTES="$(cksum < "$DEST/pre-push" 2>/dev/null | cut -d' ' -f2)"
echo "push gate: hook source = commit ${SRC_COMMIT} (${SRC_FROM}); installed copy cksum ${SUM:-unknown}, ${BYTES:-?} bytes"
[ -z "$WT_NOTE" ] || echo "push gate: $WT_NOTE"

cat <<EOF

  Every 'git push' from this clone and its worktrees now needs a /publish-review
  clearance for the exact range, including yours. Verify:
      git config --get core.hooksPath
  After .githooks/pre-push changes and is committed, run this script again from the
  main checkout to refresh the copy.
  Roll back (from your own terminal):
      one push     git push --no-verify ...
      this clone   git config --unset core.hooksPath
                   git config --get core.hooksPath     (prints nothing, exits 1)
EOF
exit 0
