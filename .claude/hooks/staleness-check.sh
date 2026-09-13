#!/usr/bin/env bash
# Flags agent and skill files whose stated verification date predates the newest
# schema migration in docs/.
#
# Why filename dates and not git timestamps: docs/YYYY-MM-DD_*.sql carries the
# date the change was actually made, and it survives shallow clones, rebases,
# squashes and fresh checkouts. Commit dates do not — in a --depth 1 clone every
# file reports the same date, which would make this check silently useless.
#
# Each agent and skill declares its own currency in frontmatter:
#     verified-against: 2026-09-10
# Files with no marker are reported as unknown rather than assumed current.
#
# Reports, never blocks. Exit code is always 0 — a stale doc is a thing to know
# at session start, not a reason to refuse to work.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Newest migration by filename date.
NEWEST_FILE="$(ls docs/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_*.sql 2>/dev/null | sort | tail -1)"
[ -z "$NEWEST_FILE" ] && exit 0
NEWEST_DATE="$(basename "$NEWEST_FILE" | cut -c1-10)"

STALE=""
UNKNOWN=""

for f in .claude/agents/*.md .claude/skills/*/SKILL.md .agents/skills/*/SKILL.md; do
  [ -f "$f" ] || continue

  # Preferred: explicit frontmatter marker. Fallback: prose "verified 2026-09-03".
  V="$(sed -n 's/^verified-against:[[:space:]]*\([0-9-]\{10\}\).*/\1/p' "$f" | head -1)"
  if [ -z "$V" ]; then
    V="$(grep -oE 'verified[[:space:]:]+[0-9]{4}-[0-9]{2}-[0-9]{2}' "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)"
  fi

  if [ -z "$V" ]; then
    UNKNOWN="${UNKNOWN}    ${f} — no verified-against marker"$'\n'
  elif [ "$V" \< "$NEWEST_DATE" ]; then
    STALE="${STALE}    ${f} — verified ${V}, schema moved ${NEWEST_DATE}"$'\n'
  fi
done

if [ -n "$STALE" ]; then
  printf 'STALE against %s (%s):\n%s' "$NEWEST_DATE" "$(basename "$NEWEST_FILE")" "$STALE"
  printf '  Treat findings from these as unverified until the file is re-checked.\n'
fi

if [ -n "$UNKNOWN" ]; then
  printf 'NO CURRENCY MARKER:\n%s' "$UNKNOWN"
fi

exit 0
