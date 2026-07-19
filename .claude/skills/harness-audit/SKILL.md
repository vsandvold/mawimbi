---
name: harness-audit
description: Audit the agent harness for knowledge-base drift, spec staleness, and code quality - verify KB and CLAUDE.md claims against the actual code, sync spec statuses with GitHub, and run the quality gates. Use periodically, before starting a new spec, or when the KB feels untrustworthy.
argument-hint: [quick | full]
---

# Harness Audit

The KB only compounds if it stays true. This audit verifies recorded knowledge against reality and fixes what drifted. `quick` = structure check (step 1) only; `full` (default) = everything below.

## 1. Structure

`bash scripts/check-harness.sh` — skill frontmatter, KB index consistency, spec status lines. Fix failures immediately.

## 2. KB drift

For each factual claim in `kb/*.md` that references code, files, or behavior, verify it against the current tree, giving each claim a verdict: **accurate / stale / wrong**, with evidence (file:line or issue/PR state). While the KB is small (a few short files), verify in one pass yourself; fan out parallel verifier subagents only once the KB outgrows a single sitting.

- **Stale** (was true, now outdated): update the entry in place, with new provenance.
- **Wrong** (never true, or misremembered): correct it and check whether anything downstream (a spec, an issue) was built on it — flag those.
- **Decisions are history**: a reversed decision gets marked **Superseded** with a pointer, never deleted.
- Check the **boundary**: operating-manual content that crept into the KB moves to CLAUDE.md and vice versa (see `kb/INDEX.md`). Duplicated content gets a single home and a link.

## 3. CLAUDE.md drift

Spot-check CLAUDE.md's factual claims the same way (commands still exist, named files still exist, patterns still hold). CLAUDE.md drift is worse than KB drift — every session inhales it.

## 4. Spec staleness

For each spec in `specs/`, compare its Status line against GitHub reality: issues filed? closed? PRs merged? Update statuses (lifecycle: `specs/README.md`) and the parent tracking issues' checklists to match. A spec contradicted by a later decision gets `Superseded` with a pointer.

## 5. Quality gates

Run and report: `npm run lint`, `npx tsc --noEmit`, `npm test -- --run`. Exception: on a clean tree whose HEAD already passed CI, cite that CI run instead of re-running the suite. In a session with recent changes, also `/code-review` on the diff. Failures here are findings to fix, not footnotes.

## 6. Report and commit

Commit the corrections with a summary of what drifted and why (the *why* often deserves a `kb/verification.md` or process note — drift patterns are themselves knowledge). Report: claims checked, drift found/fixed, gates status, anything needing a human decision.
