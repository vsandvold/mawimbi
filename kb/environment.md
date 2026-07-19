# Environment

Observed incidents behind the remote-environment guidance in CLAUDE.md (the "If `tsc`/`vitest`/`playwright` suddenly fail with missing-package errors" block). The operational instructions live there; this file is the evidence, so future sessions can judge whether that guidance still holds — or retire it if the platform changes.

## 2026-03 — @playwright/test must match the environment's cached Chromium

- Bumping `@playwright/test` 1.56→1.58 (PR #398) broke every e2e run with "Executable doesn't exist": the remote environment caches Chromium revision 1194 (the 1.56 build), while 1.58 expects revision 1208 and cannot download it. PR #416 downgraded and pinned `^1.56.1`, still current. A dependabot-style bump of `@playwright/test` alone will break e2e until the environment's cached browser moves — check the cached revision before accepting one.

## 2026-07-19 — disk reclaimer wiped node_modules mid-session, repeatedly

- `node_modules` was deleted four times within a single active session — twice silently while the dev server kept running. Recovery via plain `npm ci` took minutes each time; cache-first recovery (`scripts/ensure-deps.sh`) took ~13s, because the npm cache survives the sweep. The script was validated against a live wipe, not a simulation. (PR #465.)
- One sweep silently killed 7 of 8 parallel background subagents mid-task — no error surfaced; their transcripts just stopped.
- During the same events, `df` reported "no space left" with low "Used": "Avail" tracks a fixed per-session write allowance (~28G), not the 252G volume, and deleting files immediately frees writable space.
