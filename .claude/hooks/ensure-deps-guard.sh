#!/bin/bash
# PreToolUse(Bash) guard: self-heal node_modules before shell commands run.
# The remote environment's disk reclaimer can wipe node_modules mid-session
# (see CLAUDE.md "missing-package errors"); this makes recovery automatic
# instead of a per-command surprise. Costs a few ms when deps are intact;
# when they're not, the command that was about to fail waits ~15s for the
# cache-first reinstall instead of erroring.

# Drain stdin — the hook protocol passes tool-input JSON we don't need:
# the sentinel check is cheap enough to run before every Bash command.
cat > /dev/null

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f scripts/ensure-deps.sh ] || exit 0

# Never block the tool call, even if the reinstall fails — the command's
# own error message is more actionable than a hook failure.
bash scripts/ensure-deps.sh >&2 || true
exit 0
