#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code on the web environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

echo "Installing npm dependencies..."
npm install

# Install Netlify CLI if not present
if ! type netlify &>/dev/null; then
  echo "Installing netlify-cli..."
  npm install -g netlify-cli
fi

# Install GitHub CLI if not present
if ! type gh &>/dev/null; then
  echo "Installing gh CLI..."
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  apt-get update -q && apt-get install -y gh
fi

# Install Playwright browsers if not present
if ! playwright show-browsers 2>/dev/null | grep -q chromium; then
  echo "Installing Playwright Chromium..."
  npx playwright install --with-deps chromium
fi

echo "Session start hook complete."
