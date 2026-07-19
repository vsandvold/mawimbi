# Verification

Catalog of verification patterns that work in this repo — and the ones that look like they work but don't. Every spec's verification design starts by consulting this file (`/spec` step 3) and ends by extending it with anything new that was learned. Mechanics (commands, jsdom limits, e2e environment quirks) live in CLAUDE.md's Testing section; this file is about *choosing* the right verification for a claim.

## Choosing a verification

Work down this list; prefer the earliest level that can actually falsify the claim:

1. **Unit test (vitest)** — service state machines, reducers, pure math (e.g. `runwayConfig.test.ts` sweeps every preset across viewport heights for NaN/Infinity). Read service state via plain getters.
2. **E2E invariant (Playwright)** — anything involving real layout, paint, stacking, scrolling, or cross-feature workflows. Assert *invariants* (alignment within tolerance, element visibility, geometry resync after resize/zoom) rather than pixel snapshots where possible — invariants survive intentional restyling.
3. **Screenshot-decoded pixels** — when even DOM geometry lies. Rect-based assertions pass straight through clipping bugs (rects ignore clipping); decoding actual screenshot pixels at a location is the only automated check that catches a "renders nothing" failure. This class caught the #459 runway clipping bug after rect-based tests stayed green (PR #464).
4. **Visual snapshot (`e2e/__screenshots__/`)** — pins an *intentional look* (per-preset appearance). Costs maintenance on every restyle; use for looks, not logic.
5. **Human QA issue** — what automation cannot see (on-device feel, address-bar viewport behavior, design judgment) gets an explicit checklist issue (pattern: #467). Never leave it silently untested; the escape hatch is a tracked issue, not a shrug.
6. **Profiling issue** — reasoned performance concerns become an issue with a concrete measurement plan and a close-if-comfortable clause (pattern: #469). Don't optimize unmeasured costs; don't silently ignore them either.

## Rules of thumb

- **Bugs get a failing test first** (CLAUDE.md, Bug Fixes). The test that reproduces the bug defines what "fixed" means.
- **A computed value is not a rendered value.** Asserting on inline `style.*` in jsdom proves computation, not correct rendering — stacking/pseudo-element/paint claims need e2e (CLAUDE.md, Testing).
- **Distrust green tests around transforms and clipping.** If a change touches scroll containers, CSS transforms, or z-index, ask what a rect-based test would miss (see #464's visibility invariant).
- **Flakiness protocol:** re-run the failing spec in isolation before blaming the change; `audio.spec.ts` is known to flake under full parallel runs (PR #457 test plan).
- **Verify the fix against a live reproduction when possible** — e.g. PR #465 validated its recovery script against a real `node_modules` wipe, not a simulation.

## Harness self-check

`bash scripts/check-harness.sh` validates harness structure: skill frontmatter, KB index consistency, spec status lines.
