---
name: spec
description: Create a grounded specification for a new feature or chunk of work, including a verification design that defines how an agent will prove its own work correct. Use when asked to spec, design, or plan a feature before implementation.
argument-hint: <feature or chunk of work to spec>
---

# Create a Spec

A spec turns a feature idea into something an agent can deliver *and verify* autonomously. Specs live in `specs/NNN-slug.md` (next free number; see `specs/README.md`). The two non-negotiables: every claim in the spec is **grounded** (traceable to KB, an issue/PR, or code), and every requirement has a **verification** an agent can run — or an explicit human-QA flag.

## 1. Ground

Before writing a line of spec: `/kb read`, and search open/closed issues and recent PRs (per CLAUDE.md's GitHub CLI section) for prior art and decisions already settled in review threads — a spec that re-litigates a settled decision (e.g. "bring back fog") without new evidence is ungrounded. Read whatever code the KB and the issue trail point at.

## 2. Deliberate

Run `/council` on the core design question(s) — inline by default; escalate to the full parallel council when the spec introduces new architecture or the inline pass leaves a genuine unresolved conflict between lenses (see the escalation rule in the council skill). The decision record lands in the spec's Design section.

## 3. Design verification (the heart of the spec)

For **each requirement**, decide how an agent working alone will prove it correct — consult `kb/verification.md` and choose the earliest level that can falsify the claim (unit → e2e invariant → screenshot-decoded pixels → visual snapshot → human-QA issue → profiling issue).

Rules:
- A requirement with no runnable verification and no human-QA flag is **not done being specified** — redesign the requirement or the verification until one exists.
- Name concrete artifacts: the test file, the invariant asserted, the command that runs it.
- If verification needs new infrastructure (a fixture, a harness, a decode helper, a new e2e pattern), that infrastructure is **Milestone 1 of the spec** — it gets built before any feature code, so every subsequent milestone lands with its checks already runnable.
- New verification patterns discovered while designing go into `kb/verification.md` (via `/kb write`).

## 4. Write and commit

Write the spec from `template.md` (in this skill's directory). Then self-review: every factual claim traceable to step 1? every requirement covered by step 3? milestones ordered with verification first? Run `bash scripts/check-harness.sh`, commit the spec.

## 5. Hand off

Offer to run `/spec-to-issues` to break the spec into tracked GitHub issues. Update the spec's Status line as it moves through the lifecycle defined in `specs/README.md`.
