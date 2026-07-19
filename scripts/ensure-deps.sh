#!/bin/bash
# Restores node_modules after the remote environment's disk reclaimer has
# deleted it. This is not only a between-sessions event: reclaims have been
# observed twice within a single active session (2026-07-19), silently
# wiping node_modules while the dev server kept running and killing
# background subagents in the same sweep.
#
# Cheap when deps are intact (sentinel check only). When they're not, the
# npm cache (~/.npm) has been observed to survive the reclaim, so
# --prefer-offline mostly untars from cache instead of re-downloading.
# The onnxruntime flag skips a CUDA binary download that 403s in sandboxed
# environments (see CLAUDE.md).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

sentinels=(vite vitest playwright eslint tsc)
missing=0
for bin in "${sentinels[@]}"; do
  if [ ! -x "node_modules/.bin/$bin" ]; then
    missing=1
    break
  fi
done

if [ "$missing" -eq 0 ]; then
  exit 0
fi

echo "node_modules missing or incomplete — reinstalling..."
npm ci --prefer-offline --onnxruntime-node-install-cuda=skip
