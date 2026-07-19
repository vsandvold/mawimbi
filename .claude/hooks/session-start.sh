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

# Install Playwright browsers only when no chromium exists under the
# browsers path. Checked via the directory, not a playwright CLI probe:
# `playwright show-browsers` is not a real subcommand, so the previous
# check always failed and re-ran the install (~150MB download risk +
# apt-get round trip) on every single session start. The remote
# environment pre-installs Chromium under PLAYWRIGHT_BROWSERS_PATH
# (/opt/pw-browsers); duplicating it would also burn the session's fixed
# disk allowance.
if ! ls -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"/chromium* \
  > /dev/null 2>&1; then
  echo "Installing Playwright Chromium..."
  npx playwright install --with-deps chromium
fi

# Wait for any remaining background jobs (netlify, gh)
wait

echo "Session start hook complete."
