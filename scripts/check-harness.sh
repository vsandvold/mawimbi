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

# Skills: frontmatter block opened and closed with ---, containing name and
# description. Keys are searched only inside the block so body text (e.g. a
# YAML example in a code fence) can't satisfy the check; CRLF is tolerated.
for skill in .claude/skills/*/SKILL.md; do
  [ -e "$skill" ] || continue
  normalized=$(tr -d '\r' < "$skill")
  if [ "$(printf '%s\n' "$normalized" | head -1)" != "---" ] ||
    [ "$(printf '%s\n' "$normalized" | grep -c '^---$')" -lt 2 ]; then
    fail "$skill missing or unclosed frontmatter"
    continue
  fi
  frontmatter=$(printf '%s\n' "$normalized" | awk '/^---$/ { n++; next } n == 1 { print } n >= 2 { exit }')
  printf '%s\n' "$frontmatter" | grep -q '^name:' || fail "$skill frontmatter missing name"
  printf '%s\n' "$frontmatter" | grep -q '^description:' || fail "$skill frontmatter missing description"
done

# KB: the INDEX table and the directory agree in both directions. Filenames
# are parsed once, from the first backticked cell of each table row (later
# cells are prose and may mention other files), and compared as exact strings.
indexed=$(sed -n 's/^| *`\([A-Za-z0-9_-]\+\.md\)`.*/\1/p' kb/INDEX.md | sort -u)
for kbfile in kb/*.md; do
  base=$(basename "$kbfile")
  [ "$base" = "INDEX.md" ] && continue
  printf '%s\n' "$indexed" | grep -qxF "$base" || fail "$kbfile not listed in kb/INDEX.md's table"
done
for listed in $indexed; do
  [ -e "kb/$listed" ] || fail "kb/INDEX.md lists $listed which does not exist"
done

# KB size hygiene: the /kb skill's ~150-line soft limit. Warning only.
for kbfile in kb/*.md; do
  lines=$(wc -l < "$kbfile")
  if [ "$lines" -gt 150 ]; then
    echo "WARN: $kbfile is $lines lines (>150) — consider splitting it, see /kb"
  fi
done

# Specs: every spec declares a status from the lifecycle in specs/README.md,
# and spec numbers are unique (parallel sessions can race on "next free number").
for spec in specs/[0-9]*.md; do
  [ -e "$spec" ] || continue
  status=$(grep -m1 '^\*\*Status:\*\*' "$spec" | sed 's/^\*\*Status:\*\* *//')
  case "$status" in
    Draft | 'Issues filed' | 'In progress' | Delivered | Superseded) ;;
    '') fail "$spec missing a **Status:** line" ;;
    *) fail "$spec has unknown status '$status' (lifecycle: specs/README.md)" ;;
  esac
done
dupes=$(ls specs/ | grep -o '^[0-9]\+' | sort | uniq -d)
for n in $dupes; do
  fail "duplicate spec number $n in specs/"
done

if [ "$errors" -gt 0 ]; then
  echo "check-harness: $errors problem(s) found"
  exit 1
fi
echo "check-harness: OK"
