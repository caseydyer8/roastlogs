#!/usr/bin/env bash
# Secret scan over what is about to become a commit.
#
# This is the COMPENSATING CONTROL for narrowing pre-commit-guard.sh. That
# guard now denies only a forced `git add`, which is the right call — plain
# `git add .env` was always a no-op because .env is gitignored — but it means
# nothing is watching for a secret that arrives some other way: pasted into a
# source file, left in a test fixture, or committed inside a doc. This scans
# content rather than filenames, so it catches all of those.
#
# Scope: the working tree diff against HEAD, plus every untracked file that is
# not ignored. That is exactly the set a commit would capture. Already-committed
# history is out of scope and needs a separate retrospective pass.
#
# Exit 0 clean, 1 on a hit. Run from verify.sh BEFORE the build: it is fast,
# and a leaked credential makes the rest of the gate irrelevant.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 1

# Patterns chosen to mean a real credential rather than a mention of one.
# Each is a value shape, not a word, so prose about service_role does not trip
# it while an actual token does.
#
#   sb_secret_…          Supabase secret key
#   service_role" : "…   an assigned service_role key, not the phrase
#   eyJhbGciOi…          a JWT header; the anon key is public, but a JWT in a
#                        DIFF is worth a human look either way
#   BEGIN … PRIVATE KEY  PEM block
#   AKIA/ASIA + 16       AWS access key id
#   aws_secret…= 40 b64  AWS secret access key
#   KEY/TOKEN/PASSWORD=  a .env-shaped assignment whose value is long and
#                        opaque — 24+ chars of base64/hex alphabet
PATTERNS='sb_secret_[A-Za-z0-9_-]{8,}
"(service_role|service_role_key)"[[:space:]]*:[[:space:]]*"[^"]{16,}"
eyJhbGciOi[A-Za-z0-9_-]{10,}
-----BEGIN [A-Z ]*PRIVATE KEY-----
(AKIA|ASIA)[0-9A-Z]{16}
aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+=]{32,}
[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9/+=_-]{24,}'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Added/changed lines only. Scanning whole files would re-flag anything already
# committed on every run, and this gate is about what is being ADDED.
git diff HEAD --unified=0 2>/dev/null | grep '^+' | grep -v '^+++' > "$TMP/added" || true

# Untracked-but-not-ignored files are equally part of the next commit.
while IFS= read -r f; do
  [ -f "$f" ] && cat "$f" >> "$TMP/added" 2>/dev/null
done < <(git ls-files --others --exclude-standard 2>/dev/null)

[ -s "$TMP/added" ] || { echo "secret-scan: nothing staged or untracked to scan"; exit 0; }

HITS=0
while IFS= read -r pat; do
  [ -n "$pat" ] || continue
  # -e is REQUIRED, not stylistic: the PEM pattern begins with "-----", and
  # without -e grep parses it as a bundle of option flags. That silently
  # disabled private-key detection entirely until a planted PEM header failed
  # to trip it.
  if MATCH="$(grep -aoE -e "$pat" "$TMP/added" 2>/dev/null | head -2)"; then
    if [ -n "$MATCH" ]; then
      HITS=$((HITS + 1))
      echo "secret-scan: MATCH on pattern: $pat"
      # Show a redacted excerpt. Printing the secret into a log or a ledger
      # item would move it somewhere ELSE it does not belong.
      printf '%s\n' "$MATCH" | cut -c1-12 | sed 's/^/    excerpt (truncated): /'
      # Locate it so a human can go look, without reproducing the value.
      while IFS= read -r m; do
        [ -n "$m" ] || continue
        git grep -n -a -F -e "$m" HEAD 2>/dev/null | head -1 | cut -c1-160 | sed 's/^/    in HEAD: /'
        grep -rn -a -F -e "$m" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=build . 2>/dev/null \
          | head -2 | cut -c1-160 | sed 's/^/    in tree: /'
      done <<< "$MATCH"
    fi
  fi
done <<< "$PATTERNS"

if [ "$HITS" -gt 0 ]; then
  echo ""
  echo "secret-scan: FAIL — $HITS pattern(s) matched in content that would be committed."
  # Open a ledger item. secret-scan is a TIER 1 source, so it writes directly
  # at its own severity rather than being demoted or routed to findings/.
  if [ -f .claude/tools/ledger.js ]; then
    node .claude/tools/ledger.js add \
      --source=secret-scan \
      --type=security \
      --severity=critical \
      --title="Secret scan matched credential material in uncommitted content" \
      --body="secret-scan.sh matched $HITS pattern(s) in the working-tree diff against HEAD or in untracked files. The value is deliberately NOT recorded here — recording it would move the secret somewhere else it does not belong. Re-run .claude/hooks/secret-scan.sh to see the redacted excerpt and location." \
      --acceptance="secret-scan.sh exits 0 on the working tree, the credential is rotated if it was ever real, and the file that carried it is either gitignored or the value is removed." \
      --blocked-on="Nothing — fix before committing" >&2 || true
  fi
  exit 1
fi

echo "secret-scan: clean"
exit 0
