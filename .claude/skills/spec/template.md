# NNN — Title

**Status:** Draft
**Date:** YYYY-MM-DD
**Issues:** (filled by /spec-to-issues)

## Summary

One paragraph: what this delivers and for whom.

## Grounding

What this spec is built on — cite everything:

- KB: (e.g. `kb/product.md` — local-first rule; `kb/decisions.md` — 2026-07-18 geometry decision)
- Issues/PRs: (prior art, settled decisions, related follow-ups)
- Code: (services/features this touches, with paths)

## Goals

Numbered, testable statements of what will be true when this ships.

## Non-goals

What this deliberately does not do, and why (prevents scope creep and re-litigation).

## Design

The chosen approach. Include the council decision record:

> **Decision:** …
> **Rationale:** …
> **Dissent:** … (what the losing lenses predicted)

## Verification design

How an agent proves each goal, before any of it is built:

| Goal | Verification | Level | Artifact |
| --- | --- | --- | --- |
| 1 | e.g. alignment invariant ±8px | e2e invariant | `e2e/….spec.ts` |
| 2 | … | unit | `src/…/__tests__/….test.ts` |
| 3 | on-device feel | human QA | checklist issue |

New verification infrastructure required (this becomes Milestone 1): …

## Milestones

Ordered chunks, each independently landable and verifiable. Milestone 1 is the verification infrastructure.

1. **Verification harness** — …
2. …

## Open questions

Things a future session must resolve, with what evidence would resolve them.
