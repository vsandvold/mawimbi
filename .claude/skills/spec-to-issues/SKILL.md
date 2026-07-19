---
name: spec-to-issues
description: Break a spec from specs/ into ordered, tracked GitHub issues (parent tracking issue + sub-issues) so work can be prioritized and picked up by autonomous sessions. Use after a spec is committed, or when asked to file issues for planned work.
argument-hint: <spec file, e.g. specs/002-foo.md>
---

# Spec → GitHub Issues

Turn a spec's milestones into GitHub issues that a later `/work-issue` session can execute without re-reading the whole world. Use the GitHub MCP tools (no `gh` CLI in remote sessions); repo is `vsandvold/mawimbi`.

## 1. Read the spec; sanity-check it

The spec must have Status `Draft`, a filled Verification design, and ordered milestones with verification infrastructure first. If not, stop and finish the spec (`/spec` step 3–4) instead of filing vague issues.

## 2. File the parent tracking issue

One issue per spec: title = spec title; body = spec summary, link to the spec file on `master`, and a checklist of the milestone issues (filled in as they're created). This is the progress dashboard.

## 3. File one issue per milestone

Match the repo's established issue style (see #300–#302 for the shape):

- **Title:** imperative, specific.
- **Body sections:** parent reference ("Sub-issue of #N — Step X of Y, depends on #M"), Summary, Requirements, Implementation notes (pointers into code and KB, e.g. "follow the mute/solo pattern in `Channel.tsx`"), and **Acceptance criteria** — a checklist whose items are the spec's verification artifacts for that milestone, plus the standing "build succeeds, lint passes".
- **Verification section:** the exact commands/tests that prove the milestone, copied from the spec's verification design. An issue whose acceptance criteria can't be checked by an agent must say who checks them (human-QA checklist issue, pattern #467).
- Link sub-issues to the parent with `sub_issue_write` where possible; otherwise the "Sub-issue of #N" body convention carries the relationship.
- **The verification-infrastructure milestone is issue #1 of the spec and blocks the rest.** State the dependency chain explicitly in each body.

## 4. Order and prioritize

Dependencies define the base order; within free choice, put user-visible value earlier and stretch goals last (mark them as such, pattern #302). Don't file issues for Open Questions — resolve them or note them in the parent issue.

## 5. Close the loop

- Update the spec: Status → `Issues filed`, and list the issue numbers under **Issues:**.
- Tick the parent issue's checklist format into place.
- Commit the spec update; run `bash scripts/check-harness.sh`.
