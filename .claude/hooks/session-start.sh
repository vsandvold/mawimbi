#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code on the web environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# Run npm install and system tool installs in parallel — they are independent.
# ensure-deps.sh is a no-op when node_modules is intact, and reinstalls
# cache-first when the environment's disk reclaimer has wiped it (which can
# also happen mid-session — see CLAUDE.md).
echo "Ensuring npm dependencies..."
bash scripts/ensure-deps.sh &
NPM_PID=$!

# Install Netlify CLI if not present
if ! type netlify &>/dev/null; then
  echo "Installing netlify-cli..."
  npm install -g netlify-cli &
fi

# Install GitHub CLI if not present
if ! type gh &>/dev/null; then
  echo "Installing gh CLI..."
  (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update -q && apt-get install -y gh) &
fi

# Wait for all parallel jobs before proceeding
wait $NPM_PID

# Install Playwright browsers if not present (requires node_modules from npm ci).
# Skipped when the environment pre-installs Chromium and pins it via
# PLAYWRIGHT_BROWSERS_PATH — downloading a duplicate browser (~150MB) both
# wastes time and burns the session's fixed disk allowance.
if [ "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" != "1" ] \
  && ! npx playwright show-browsers 2>/dev/null | grep -q chromium; then
  echo "Installing Playwright Chromium..."
  npx playwright install --with-deps chromium
fi

# Wait for any remaining background jobs (netlify, gh)
wait

echo "Session start hook complete."
