# Decisions

Architectural decisions with rationale and provenance, newest first. Entry format: date, decision, why, source. When a decision is reversed, mark the old entry **Superseded** with a pointer — don't delete it; the rationale trail is the point.

## 2026-07-19 — Stub Node-only transitive ML dependencies

**Decision:** `package.json` `overrides` maps `onnxruntime-node` and `sharp` to an in-repo empty package.
**Why:** the packages are dead weight (all inference is in-browser), and a *local* stub — rather than a registry "empty package" — keeps third parties out of the supply chain. Sizes, recovery-speed rationale, and the runtime failure-mode gotcha: CLAUDE.md, "Stubbed Node-only dependencies".
**Source:** PR #466.

## 2026-07-19 — Runway is a pure transform stage; PhantomScroller is the only scroll container

**Decision:** No scroll container inside the tilted plane; scroll position is applied as a `translateY` offset stage, and spectrogram canvases are positioned imperatively in the draw rAF loop.
**Why:** Scroll clipping happens in pre-transform layout space, so a scrolling tilted plane clipped everything at/above the playhead before the transform could project it into view — while rect-based tests kept passing. Also removes tilt-side `scrollTop` clamping (#450) by construction.
**Source:** Issue #459, PR #464.

## 2026-07-18 — Solve runway geometry in JS, accept one-frame resize lag

**Decision:** Timeline padding and all runway transforms come from `runwayProjection.solveGeometry()` in JS, replacing pure-CSS `cqh`/custom-property mechanisms.
**Why:** The layout→screen mapping is nonlinear under perspective; CSS `calc()` cannot express the inverse projection, and the linear approximation drifted whenever tilt + open drawer combined. Cost: padding lags one frame behind *continuous* native resize (tracked as #453 — accepted tradeoff, not a regression to revert).
**Source:** Issues #443, #445, #453; PR #452.

## 2026-07-18 — Edge rails instead of fog on the runway

**Decision:** Atmospheric fog gradient removed in favor of glowing rails along the timeline edges, rendered as CSS pseudo-elements so the existing `rotateX` projects them.
**Why:** Fog sat behind the playhead's frequency-bar overlay and read as mud; rails match the Beat Saber-style reference art. Fog is deliberately not coming back (scope note on #446).
**Source:** PRs #454 (fog reintroduced), #456 (replaced by rails).

## 2026-07-18 — Dev-only tuning overlay instead of tune-by-PR

**Decision:** Visual tuning of the runway happens through a live slider overlay (dev builds / `?tune`), which serializes the result as a `runwayConfig.ts` snippet.
**Why:** Six consecutive PRs had shipped just to adjust single parameters; a feedback loop measured in seconds replaces one measured in deploys.
**Source:** Issue #447, PR #455.

## 2026 (Q1) — Signals-based service layer

**Decision:** Service state lives in `@preact/signals-react` signals with single-owner semantics, bridge hooks translating to React, and services as state machines.
**Why:** Decouples the audio engine's state from React render cycles; gives tests synchronous plain-getter access; makes ownership auditable. The full design and its rules are in CLAUDE.md ("Design Principles").
**Source:** `FUTURE_PLANS.md` ("Signal-Synced Architecture"), PRs #103–#111, #114.
