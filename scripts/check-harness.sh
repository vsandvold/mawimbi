#!/usr/bin/env bash
# Structural checks for the agent harness (skills, knowledge base, specs).
# Run via /harness-audit or directly: bash scripts/check-harness.sh
set -u

cd "$(dirname "$0")/.."
errors=0

fail() {
  echo "FAIL: $1"
  errors=$((errors + 1))
}

# Every skill has YAML frontmatter with name and description.
for skill in .claude/skills/*/SKILL.md; do
  [ -e "$skill" ] || continue
  head -1 "$skill" | grep -q '^---$' || fail "$skill missing frontmatter"
  grep -q '^name:' "$skill" || fail "$skill frontmatter missing name"
  grep -q '^description:' "$skill" || fail "$skill frontmatter missing description"
done

# Every KB file is listed in the index, and every listed file exists.
for kbfile in kb/*.md; do
  base=$(basename "$kbfile")
  [ "$base" = "INDEX.md" ] && continue
  grep -q "$base" kb/INDEX.md || fail "$kbfile not listed in kb/INDEX.md"
done
for listed in $(grep '^|' kb/INDEX.md | grep -o '[A-Za-z-]*\.md' | sort -u); do
  [ -e "kb/$listed" ] || fail "kb/INDEX.md lists $listed which does not exist"
done

# Every spec declares a status.
for spec in specs/[0-9]*.md; do
  [ -e "$spec" ] || continue
  grep -qi '^\*\*Status:\*\*' "$spec" || fail "$spec missing a **Status:** line"
done

if [ "$errors" -gt 0 ]; then
  echo "check-harness: $errors problem(s) found"
  exit 1
fi
echo "check-harness: OK"
