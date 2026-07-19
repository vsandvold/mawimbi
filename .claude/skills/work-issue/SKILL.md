---
name: work-issue
description: Execute a GitHub issue end-to-end autonomously - ground in the KB/spec/code, build or run its verification first, implement, verify, review, ship a PR, and capture learnings back to the KB. Use when asked to work on, implement, or fix a numbered issue.
argument-hint: <issue number>
---

# Work an Issue

The delivery loop for one issue. The ordering is the point: **verification exists before implementation**, and **the KB gets paid back before the session ends**.

## 1. Ground

`/kb read`, plus the spec behind the issue (linked from its parent; specs live in `specs/`). Two things easy to skip: issue comments and linked PR reviews often carry decisions newer than the issue body; and if grounding reveals the issue is stale, already done, or contradicted by a newer decision — comment on it with the evidence and stop, don't implement a stale plan.

## 2. Verification first

- If the issue's acceptance criteria name tests/invariants that don't exist yet, **write them now**, before feature code. For the spec's verification-infrastructure milestone, that *is* the whole issue.
- For a bug: failing test first, always (CLAUDE.md, Bug Fixes).
- If while writing the checks you find the criteria unverifiable as stated, redesign the check (consult `kb/verification.md`), and note the change in the eventual PR body.

## 3. Implement

Per CLAUDE.md's Working Defaults, on the session's designated branch. For a genuinely ambiguous design choice mid-implementation, run an inline `/council`; otherwise state the assumption and proceed.

## 4. Verify

Run the issue's verification commands, then verify per CLAUDE.md's Working Defaults (`npm run lint` plus the tests relevant to the change; e2e with `--reporter=list` in headless sessions). Only claim what this session has evidence for. Check acceptance-criteria boxes only when their check actually ran green.

## 5. Ship

Follow CLAUDE.md's Pull Requests section: commit and push, run `/code-review` and address confirmed findings, then open the PR with a summary and a test plan listing the commands actually run. Subscribe to the PR's activity and babysit CI to green.

## 6. Pay back

- `/kb write` — capture durable learnings from this session.
- Comment on the issue per CLAUDE.md's Issue Updates format (what was done, recommended next steps).
- If this was the spec's last milestone: spec Status → `Delivered`; close the parent tracking issue with a summary.
