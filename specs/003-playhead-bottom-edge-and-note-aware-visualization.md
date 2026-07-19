# 003 — Playhead: bottom-edge alignment and note-aware visualization

**Status:** Draft
**Date:** 2026-07-19
**Issues:** (filled by /spec-to-issues)

## Summary

Re-anchor the loudness-meter playhead so its **bottom edge sits on the playhead line** (today the box is centered on it), reduce its height accordingly, and evolve its rendering from raw CQT bars into a musically aware display: per-semitone (12-TET) frequency bars, an expansive magnitude→height mapping that makes fundamentals tower over harmonics and noise, a sparkle/welding burst where a transcribed note crosses the line, and an onset-driven pulse of the meter frame. Owner request (2026-07-19), building on the settled runway geometry (#443–#464): the geometry itself — playhead position, resize, drawer open/close re-solving — is explicitly out of scope because it already works.

## Grounding

- KB `kb/product.md`: the spectrogram/runway is the product's visual identity; the vertical timeline exists so music "comes towards you" into the playhead — effects that fire *at the line* reinforce the core metaphor. Mobile first; visual polish of the runway area is actively invested in (#443–#469). "Two layers of perception, two renderings" (owner statement, 2026-07-19): the spectrogram serves perceptual *nuance* (compressive dB mapping), the playhead meter serves perceptual/conceptual *categorization* (expansive mapping, 12-TET bars) — the mapping split in Q3 is that principle applied, not an inconsistency.
- KB `kb/domain.md`: live playhead data is CQT, 24 bins/octave from C1 (32.7 Hz) — 2 bins per semitone, bin 0 on a note center (`FrequencyVisualizer`, `LiveCQTAnalyser`). Pool bins with **max, never sum** (#152, #195). Loudness visuals use RMS with a perceptual power curve, driven per-frame outside React (#98, #101). Live-then-refine is the established pattern for analysis (#302).
- KB `kb/decisions.md` 2026-03-15: the plasma playhead (beat detection, spark particles, tendrils) was replaced by the loudness meter because its particle internals were untestable (#365, #417, #418). **This spec partially revisits that decision — the new evidence is an explicit owner request plus a testability-first design (pure, seeded, deterministic simulation) that removes the reason plasma died.** The spectacle returns only where the test harness can see it.
- KB `kb/verification.md`: 12-TET spacing test is mandatory for any new frequency mapping (#220); screenshot-decoded pixels are the only automated check that catches "renders nothing" (#464); human-QA checklists (#467) and profiling issues (#469) are the escape hatches.
- Issues/PRs: #460 (playheadFraction 0.5 — the "runway at 50% height" premise), #461 (meter width derived from solved geometry), #467 (open; its third checklist item — is the meter's 40%-height box the intended look? — is *answered* by this spec), #165 (tempo/beat tracking, open, untouched here), #447 (`?tune` precedent for dev-only seams).
- Code: `src/features/workstation/scrubber/Scrubber.css` (`.scrubber__playhead` centers the box on the line; `--meter-height: 0.4 × available-height`), `loudnessMeterRenderer.ts` (`computeMeterRect` centers the rect vertically, 2:1 aspect; `render` receives `loudness` but ignores it), `Playhead.tsx` / `LoudnessMeterPlayhead.tsx` (imperative handle), `useScrubberScroll.ts` (the one rAF loop; has playback/track services and `audioService` in scope), `SpectrogramCache.getMelody(trackId)` (per-track `MelodyNote[]` after transcription), `PianoRollRenderer.midiNoteToBin()` (the shared MIDI→bin mapping), `e2e/runway-geometry.spec.ts` (`getPlayheadLineY` currently defines the line as the overlay's vertical **center** — the exact contract this spec changes; also contains the pixel-decode pattern to extract).

## Goals

1. **Bottom-edge alignment.** The meter rect's bottom edge renders on the playhead line (screen Y = `playheadFraction × visibleHeight`), replacing the centered-box contract, and stays there through window resize, drawer open/close, zoom, and reduced motion (the existing invariant suite, re-anchored).
2. **Reduced height.** The playhead box shrinks from 0.4× to 0.25× of visible height and the meter rect's aspect from 2:1 to 3:1 (width:height), so the box sits above the line without crowding the horizon (at `playheadFraction − elevationFraction` = 15% from the top).
3. **12-TET bars.** Frequency bars are per-semitone: each bar max-pools its semitone's 2 CQT bins, doubling bar width and centering every bar on a note frequency — the same bin mapping the piano roll uses.
4. **Fundamental emphasis.** Semitone-bar heights use an expansive magnitude→height transfer (γ power curve on the dB-linear CQT bytes) with per-bar attack/decay smoothing, plus a mild secondary de-emphasis of the spectral extremes — so a tone's fundamental visibly towers over its harmonics and the noise floor wherever in the register it falls, while the spectrogram's own compressive color mapping stays untouched (`kb/product.md`, two layers of perception).
5. **Note sparkles.** While a transcribed note of an unmuted track is under the playhead during playback, a sparkle/welding burst emits at that note's frequency position on the line.
6. **Onset pulse.** The meter frame glows with an attack/decay pulse on onsets detected by spectral flux over the live CQT frames.

Design constraint across all goals: every per-frame computation stays in the existing `useScrubberScroll` rAF loop and the canvas renderer — no per-frame React state updates (#98/#101 pattern), no second clock (engine time only; `transportTime` is not a clock — CLAUDE.md).

## Non-goals

- **Beat tracking / tempo estimation.** Pulsation is onset-driven only. Beat-synchronized pulsation ("pulsate with the estimated beat") needs tempo inference — that is #165's scope and a future spec; the onset envelope built here is its natural input.
- **Runway geometry changes.** Playhead position, projection, resize/drawer re-solve are settled (#443–#464) and confirmed good by the owner. No changes to `runwayProjection` or presets beyond the meter-box CSS.
- **Sparkles during live recording.** Melody data exists only after offline transcription completes; the in-progress recording has none. Consistent with live-then-refine (#302); a live-pitch sparkle path would be its own spec.
- **Restoring plasma-style beams/tendrils.** Only the note-anchored sparkle burst returns, in testable form. Tap-to-seek and other settled runway decisions stay settled.

## Design

### Q1 — Where bottom-edge alignment lives

> **Decision:** Two coordinated changes with one contract: `.scrubber__playhead`'s `top` becomes `playheadFraction × availableHeight − meterHeight` (box bottom on the line), and `computeMeterRect` bottom-aligns the rect in the canvas (`y = canvasHeight − height`). Box height 0.4H → 0.25H; rect aspect 2:1 → 3:1. Bars already grow upward from the rect bottom, which now *is* the line — the bars rise off the playhead line like the music arriving at it.
> **Rationale:** The line's screen position is already a single derivation (`--playhead-fraction` from the solved geometry, #461/#462); only the box's relationship to it changes. Bottom-aligning both layers keeps "rect bottom = line" true even when the canvas-height clamp engages on wide viewports.
> **Dissent:** Adversary wanted a below-line overdraw margin reserved now for sparkle spill; Simplicity won — the margin (`SPARK_OVERDRAW_PX`) is added in the sparkle milestone if and only if sparks visually clip. Product notes 0.25H/3:1 are chosen by reasoning, not on hardware — explicitly checkpointed to human QA (Goal 2).

### Q2 — 12-TET emphasis

> **Decision:** Pure function `poolSemitoneBars(bins: Uint8Array): Uint8Array` max-pools bin pairs `[2n, 2n+1]` into one bar per semitone; the renderer draws semitone bars only.
> **Rationale:** One move delivers broader bars *and* note-centered bars; max-pooling is the KB-mandated pooling (#152/#195); bar n's center matches `midiNoteToBin` used by the piano roll, so sparkles (Q4) and bars land on the same x positions.
> **Dissent:** Adversary: the quarter-tone bin between notes n and n+1 is attributed to note n, and vibrato spanning a note boundary can flicker between adjacent bars. Accepted for a visualization; flagged in the human-QA checklist.

### Q3 — Fundamental emphasis (revised 2026-07-19 after owner review)

> **Decision:** The primary mechanism is the **magnitude→height transfer function**, not a frequency-band curve. The CQT byte scale is linear in dB over [−80, −30] (`magnitudeToByte`, `CQTAnalyser.ts`) and bar height is linear in the byte, so bar height is linear in dB — a harmonic 10 dB below its fundamental (≈3× weaker) still draws 80% of the fundamental's height, which is why the current bars read as a wall of near-equal heights. The playhead renderer applies an expansive curve `(byte/255)^γ` (γ ≈ 2–3, named constant) to the semitone bars, with per-bar attack/decay smoothing (spectrum-analyzer ballistics) to tame the 8-bit quantization flicker that expansion amplifies. A mild fixed band curve de-emphasizing the spectral extremes remains as a *secondary* weighting. The RMS `loudness` render parameter is retained, not deleted — reserved for the envelope-scaling follow-up below.
> **Rationale:** Expansion is content-adaptive: it emphasizes *peaks* wherever they occur, and a tone's fundamental is usually its strongest partial — whereas a band curve is content-blind (it would boost midrange noise and penalize genuine bass/soprano fundamentals). It is the mirror image of the loudness visual's compressive 0.6 power curve (#98/#101): a single scalar is compressed for smooth motion, per-bin contrast is expanded for categorical reading. The compressive dB mapping is *not* changed where it is right: per `kb/product.md` ("Two layers of perception, two renderings"), the spectrogram's color mapping stays compressive so nuance remains visible, while the playhead meter expands so the perceptually categorized tones dominate — different surfaces serve different perceptual layers by design.
> **Dissent:** Adversary: expanding quantized 8-bit values amplifies low-level flicker; smoothing mitigates it but its time constants are feel-tuning (QA checklist). Follow-up candidates if γ-expansion still reads flat on real material: per-frame peak normalization with the retained RMS `loudness` scaling the overall envelope (bar shape = relative spectrum, overall scale = perceived loudness), and a harmonic-support boost (boost a bar whose 2f/3f bars also carry energy).

### Q4 — Testable sparkles

> **Decision:** Split simulation from rendering. `sparkleSimulation.ts` is a pure module: `(activeNotes: {trackId, midiNote, startTime}[], engineTime) → particle states {x, y, age, intensity}`, with a seeded PRNG (e.g. mulberry32) keyed per note identity — no `Math.random`, no wall clock. The rAF loop gathers active notes (per unmuted track: `SpectrogramCache.getMelody(trackId)` notes where `startTime ≤ t ≤ endTime`, x from `midiNoteToBin` → semitone bar center) and passes them through the extended `PlayheadHandle.render`. The canvas renderer draws whatever states it is given and is deliberately not unit-tested (#365).
> **Rationale:** Determinism makes the simulation falsifiable — the exact property whose absence killed the plasma playhead (#417/#418). Reusing `midiNoteToBin` keeps the 12-TET guard (#220) meaningful across bars, piano roll, and sparkles.
> **Dissent:** Performance flagged the per-frame linear scan over all tracks' notes; measured judgment is that amateur-scale projects (thousands of notes) are trivially fine at 60 fps — if that's ever wrong it becomes a profiling issue (#469 pattern), not a premature cursor optimization.

### Q5 — Onset pulse

> **Decision:** `OnsetDetector`, a small pure-state class fed each frame's CQT bins from the existing loop: half-wave-rectified spectral flux vs the previous *distinct* frame (byte-identical frames skipped — rAF outpaces the ~25 ms analysis hop), adaptive threshold from a rolling median, emitting an envelope value 0–1 with instant attack and exponential decay. The renderer maps the envelope to the meter frame's border glow/width.
> **Rationale:** Spectral flux over already-computed CQT frames is the minimal credible onset signal — no new analysis path, no worklet changes, unit-testable with synthetic frame sequences. Its envelope is exactly what a future beat tracker (#165) would drive instead.
> **Dissent:** Adversary: rAF sampling is irregular (dropped frames), so flux is not hop-aligned and onset timing can jitter by a frame. Accepted — this drives a glow, not audio alignment.

## Verification design

| Goal | Verification | Level | Artifact |
| --- | --- | --- | --- |
| 1 | `computeMeterRect` bottom-alignment unit tests (`y + height === canvasHeight`, incl. clamp case); e2e: re-anchor `getPlayheadLineY` to the box **bottom** edge, then the existing alignment/visibility/drawer/resize invariants re-run against the new contract (±8px) | unit + e2e invariant | `loudnessMeterRenderer.test.ts`, `e2e/runway-geometry.spec.ts` |
| 2 | Unit: box-height/aspect constants produce rect ≤ 0.25H and 3:1; visual snapshots updated; look/feel sign-off | unit + visual snapshot + human QA | `loudnessMeterRenderer.test.ts`, `e2e/__screenshots__/`, QA checklist issue (successor to #467's meter item) |
| 3 | 12-TET spacing test (mandatory, kb/verification.md): a synthetic pure tone at note n lights bar n; bar centers match `midiNoteToBin`/2 within ±1 bar; semitone spacing uniform | unit | `__tests__/semitoneBars.test.ts` |
| 4 | Synthetic harmonic tone (fundamental + harmonics at −10 dB): fundamental-to-harmonic bar-height *ratio* strictly greater under the expansive transfer than under the current linear-in-dB mapping; transfer is monotone; smoothing converges on a step input with attack faster than decay; equal bytes at C4 vs C1/C8 render taller at C4 (secondary band curve) | unit | `__tests__/barTransfer.test.ts` |
| 5 | Sim: identical `(notes, engineTime)` → identical particles; particles expire after max age; emission x = the note's semitone bar center; no emission for muted tracks (loop-side filter test). E2E: screenshot-decoded pixels (#464 pattern) show sparkle-colored pixels in a band at the expected x on the line while a melody note is active, and none in a silent region | unit + screenshot-decoded pixels | `__tests__/sparkleSimulation.test.ts`, `e2e/playhead-effects.spec.ts` |
| 6 | Detector: impulse-train frame sequence → one envelope attack per impulse (transition-trace assertion on envelope, not visibility polls — kb/verification.md); steady-state and silent sequences → no attacks; byte-identical consecutive frames skipped | unit + human QA (feel) | `__tests__/onsetDetector.test.ts`, same QA checklist |

New verification infrastructure required (Milestone 1):

- **Extract the pixel-band decode helper** from `runway-geometry.spec.ts` into a shared e2e helper (`e2e/helpers/…` or `fixtures.ts`) so `playhead-effects.spec.ts` can assert decoded pixels without duplicating it.
- **An e2e melody path.** Sparkle e2e needs a track that *has* transcription. Preferred: real Basic Pitch transcription of the short fixture file — the model is self-hosted in `public/basic-pitch-model/` (kb/decisions.md 2026-03-09), so the fixture's network block doesn't apply; measure its runtime/determinism in the e2e environment first. Fallback if slow or flaky: a dev-only melody injection seam (URL-param-gated like `?tune`, #447) that seeds `SpectrogramCache.setMelody` with a fixture melody. Milestone 1 makes this call empirically and records it in `kb/verification.md`.

## Milestones

1. **Verification harness** — extract the pixel-decode e2e helper; build the e2e melody path (measure real transcription of a fixture file; fall back to the injection seam) and land a proving e2e that a known note is present at a known time. `/kb write` the chosen pattern.
2. **Bottom-edge alignment + size reduction** — failing-first: re-anchor `getPlayheadLineY` and add the `computeMeterRect` bottom-alignment tests, then change `Scrubber.css` (box top/height) and `computeMeterRect` (bottom-align, 3:1). Update visual snapshots. Comment on #467 that its meter-look item is superseded by this spec's QA checklist.
3. **12-TET semitone bars** — `poolSemitoneBars` + spacing test; renderer draws semitone bars.
4. **Fundamental emphasis** — expansive magnitude→height transfer + ballistics smoothing + mild band curve, with the harmonic-ratio test; keep the `loudness` render parameter, documented as reserved for the envelope-scaling follow-up (Q3 dissent).
5. **Sparkles** — `sparkleSimulation` + tests; active-note gathering in the rAF loop (unmuted tracks only); renderer particle pass; `SPARK_OVERDRAW_PX` canvas margin only if sparks clip at the line; e2e decoded-pixel assertions.
6. **Onset pulse + QA handoff** — `OnsetDetector` + tests; frame-glow rendering; file the human-QA checklist issue (meter look, sparkle aesthetics, pulse feel, quarter-tone attribution) in the #467 pattern; `/kb write` durable learnings.

Each milestone is independently landable; 3–6 are pure additions behind the same render entry points and can ship as separate PRs.

## Open questions

- **0.25H / 3:1 the right size?** Resolved by Milestone 2's human QA on a real phone (tuning is a constants edit; no geometry change).
- **Real transcription in e2e: fast and deterministic enough?** Resolved empirically in Milestone 1; the fallback seam is specified above.
- **Do γ-expansion plus the mild band curve read as "fundamental emphasis" on real multi-track material?** γ and the smoothing time constants are feel-tuning; resolved by the Milestone 6 QA checklist. The escalation path (per-frame peak normalization + loudness envelope scaling, harmonic-support boost) is recorded in Q3's dissent.
- **Sparkle look ("welding iron")** — particle count, spread, color (track color vs white-hot?) are renderer constants; the sim API is designed so tuning them never touches tested logic. Color choice interacts with the pinned-`Math.random` track-color e2e pattern (#21/#36) if track-colored.
