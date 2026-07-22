---
name: work-issue
description: Execute a GitHub issue end-to-end - ground in the KB/spec/code, build or run its verification first, implement, verify, ship a PR, then (once a human runs the human-gated /code-review) address findings and capture learnings back to the KB. Use when asked to work on, implement, or fix a numbered issue.
argument-hint: <issue number>
---

# Work an Issue

The delivery loop for one issue. The ordering is the point: **verification exists before implementation**, **the PR opens as soon as the feature commit lands**, **code review is a human-gated pause after that** (`/code-review` cannot be triggered by the agent — `kb/environment.md`, 2026-07-21), and **the KB gets paid back after review, before the session ends**. Each stage lands its own commit — feature code, then review fixes, then the KB update — so the PR history shows what review actually changed instead of folding it into the original diff.

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

## 5. Commit

Commit the feature code now. Committing first means review's fixes (step 7) land as their own commit instead of being silently folded into the implementation.

## 6. Ship

Push the feature commit and open the PR: a summary, a test plan listing the commands actually run, and `Closes #<issue-number>` in the body so merging auto-closes the issue. Comment on the issue per CLAUDE.md's Issue Updates format (what was done, recommended next steps). Subscribe to the PR's activity and babysit CI to green. PR creation is pre-authorized (CLAUDE.md, Pull Requests) — don't pause to ask first.

## 7. Review (human-gated)

`/code-review` is gated to explicit human invocation and the agent cannot trigger it itself (`kb/environment.md`, 2026-07-21). End this stage by waiting rather than substituting a manual pass — the point of this step is the real skill's findings. When a human runs `/code-review` (this session or a fresh one against the PR branch) and findings come back, address the confirmed ones and commit the fixes **separately** from the feature commit, then push. Do this before `/kb write` — review often surfaces the mistakes and tradeoffs that are actually worth capturing.

## 8. Pay back

- `/kb write` — capture durable learnings from this session, so the update lands in this PR rather than a follow-up one. Include anything code review surfaced that's durable and non-derivable, not just narration of the review itself. Commit the KB update **separately** (`kb/*.md`, `CLAUDE.md`, `specs/*.md` changes in their own commit) and push.
- If this was the spec's last milestone: spec Status → `Delivered`, and close the parent tracking issue with a summary once the PR merges.
