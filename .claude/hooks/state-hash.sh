#!/usr/bin/env bash
# Content hash of everything that can change app behaviour.
# Shared by verify.sh (records what was proven) and stop-gate.sh (asks whether
# what is on disk now is what was proven).
#
# Content, not `git status` output: status lists filenames and flags, so editing
# the same file twice produces an identical line and the gate would wave the
# second edit through as already-verified.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 1

if command -v sha1sum >/dev/null 2>&1; then
  H=sha1sum
elif command -v shasum >/dev/null 2>&1; then
  H=shasum
else
  echo "no-hasher-available"
  exit 1
fi

{
  git rev-parse HEAD 2>/dev/null || echo no-head
  find src e2e public -type f \
       \( -name '*.js' -o -name '*.jsx' -o -name '*.css' \
          -o -name '*.html' -o -name '*.json' \) 2>/dev/null \
    | LC_ALL=C sort | tr '\n' '\0' | xargs -0 "$H" 2>/dev/null
  "$H" package.json playwright.config.js 2>/dev/null
} | "$H" | cut -d' ' -f1
