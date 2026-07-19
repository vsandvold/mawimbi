# 001 — Agent Harness

**Status:** Delivered
**Date:** 2026-07-19
**Issues:** none (delivered in a single PR alongside this spec)

## Summary

A harness that lets an autonomous agent (Fable/Opus/Sonnet session) take a feature from idea to shipped PR with compounding quality: spec creation grounded in a knowledge base and repo history, spec-to-issue breakdown for tracking, verification designed before implementation, multi-perspective deliberation during planning, and drift audits that keep the recorded knowledge true.

## Grounding

- Repo history: the workflow this formalizes already exists informally — per-issue Verification sections (#448, #453, #468, #469), PR test plans with actual commands run (#452–#457), human-QA checklist issues (#467), profiling issues with close-if-comfortable clauses (#469), failing-test-first bug fixes (CLAUDE.md).
- CLAUDE.md Working Defaults: `/code-review` before PRs, verify before claiming done, simplest thing that works.
- `docs/` is a published GitHub Pages site, so internal knowledge lives at repo root (`kb/`, `specs/`) instead — same tier as `FUTURE_PLANS.md`.

## Goals

1. `/spec` produces grounded specs in `specs/` whose every requirement has a runnable verification or explicit human-QA flag, with verification infrastructure as Milestone 1.
2. `/spec-to-issues` files a parent tracking issue plus ordered milestone sub-issues matching the repo's established issue style.
3. `/kb` gives every session a read-before-planning / write-before-finishing protocol over `kb/`, with a clean boundary against CLAUDE.md.
4. `/council` structures multi-perspective deliberation (parallel adversarial lenses, evidence-based synthesis, recorded dissent) during planning.
5. `/work-issue` executes an issue end-to-end: ground → verification first → implement → verify → review → ship → pay back the KB.
6. `/harness-audit` detects and fixes KB/CLAUDE.md/spec drift and runs the quality gates.

## Non-goals

- No automation of *when* skills run (no hooks forcing `/kb write`); the loop is encoded as instructions in CLAUDE.md and the skills themselves.
- No migration of `FUTURE_PLANS.md` into specs; it remains the long-range idea list that specs draw from.
- No CI enforcement of harness structure yet (see Open questions).

## Design

Six skills under `.claude/skills/`, each a procedure over shared artifacts: `kb/` (seeded topic files + INDEX), `specs/` (this file + README + template), and `scripts/check-harness.sh`. CLAUDE.md gains an Agent Harness section wiring the loop into every session's defaults.

> **Decision:** knowledge lives in flat markdown at repo root, keyed by an INDEX, with a hard content boundary against CLAUDE.md.
> **Rationale:** CLAUDE.md is auto-loaded every session and must stay lean; the KB is read on demand and can grow. Duplication is the main failure mode of two knowledge stores, so the boundary (how-to-work vs. what-and-why) is stated in both places and checked by `/harness-audit`.
> **Dissent:** a single ever-growing CLAUDE.md is simpler but bloats every session's context; per-feature knowledge files co-located in `src/features/*/` were rejected because business rules and decisions cut across features.

## Verification design

| Goal | Verification | Level | Artifact |
| --- | --- | --- | --- |
| 1–6 | skills have valid frontmatter; KB files and index agree both ways; specs carry valid, unique-numbered Status lines | structural check | `scripts/check-harness.sh` |
| 1–6 | skill procedures are followable and produce the named artifacts | human QA + first real use | next `/spec` run on a real feature |
| 3, 6 | KB claims stay true against the tree | audit procedure | `/harness-audit` step 2 |

New verification infrastructure (Milestone 1): `scripts/check-harness.sh` — built first in this delivery.

## Milestones

1. **Verification harness** — `scripts/check-harness.sh` ✔
2. KB seed (`kb/INDEX.md`, `product.md`, `domain.md`, `decisions.md`, `verification.md`) ✔
3. Skills (`kb`, `council`, `spec`, `spec-to-issues`, `work-issue`, `harness-audit`) + spec template ✔
4. CLAUDE.md Agent Harness section + this spec ✔

## Open questions

- Should `check-harness.sh` run in CI? Evidence to decide: whether harness files drift in practice between audits (first few `/harness-audit` runs will tell).
- Does the council need a persistent transcript per spec, or is the decision record enough? Evidence: whether future sessions ever need to re-open a settled deliberation.
