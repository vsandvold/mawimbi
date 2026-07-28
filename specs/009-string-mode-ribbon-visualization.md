# 009 — String mode: the ribbon visualization

**Status:** Draft
**Date:** 2026-07-27
**Issues:** (filled by /spec-to-issues)

> **Path note.** The originating prompt asked for `docs/ribbon-visualization.md`. This lives in `specs/` instead: `docs/` is the published GitHub Pages site (`docs/_config.yml`, `docs/index.md`), and `/spec` was invoked, which means the harness contract applies — a numbered spec with a status line, a verification design, and milestones that `/spec-to-issues` can break into tracked issues (`specs/README.md`). Nothing else about the request changed.

## Summary

**String mode** is a third view of a project's audio, alongside the runway timeline. Each track becomes a horizontally stationary ribbon pinned at both ends of the viewport. It never scrolls and never translates; audio propagates through it as a travelling pulse that deforms it vertically — height, thickness, ripple, and colour all modulated in place. The reference image is a vibrating string or a vocal fold, not a strip of film. It is a **Now-scale** view (roughly 0.25–2 s of audible history), and it does not replace the timeline: it occupies a scale the existing zoom range cannot reach.

This spec is a design document. It fixes the channel allocation, picks and justifies a propagation model, resolves the renderer and analysis questions against what this codebase actually has, and defines how each claim gets proven. **No implementation code is written by this spec.**

## Grounding

**KB.**
- `kb/product.md` — the core promise is visual ("Visualize and manipulate sounds like you hear them"); the vertical timeline and runway exist *for* the "music coming towards you" metaphor (#358); the runway is short-term auditory memory with only the slightest anticipation, so visualizations must make the *just-heard* legible and must never use note-highway "approaching events strike the line" mechanics; **one stream, focusable sources** — semi-transparent stacked tracks represent the combined stream and per-track emphasis represents selective attention; two layers of perception (categorization and nuance) get two renderings; mobile is a first-class target; dark theme is default and light must keep working.
- `kb/domain.md` — CQT rather than linear FFT, 24 bins/octave from C1, Q ≈ 34.1; every analysis path must share the CQT bin definition or misalignment bugs follow (#197, #218, #220, #230); melody note times are **track-buffer-relative**, not global (#484); `Tone.Transport` is the single timeline clock; essentia's ticks lag ~34 ms and coast past the last real beat.
- `kb/decisions.md` — 2026-07-25 (`MIN_TEMPO_CONFIDENCE = 1.1`); 2026-07-25 (a persisted store's *restore* read is half of adding the store, not a follow-up); 2026-07-26 (rung stride vs. tick alpha as level-of-detail; onset ticks share the track canvas to inherit its opacity).
- `kb/verification.md` — this sandbox delivers **zero** live `AudioWorkletProcessor` frames to the main thread for any tap point (#542), so anything driven by live analysis is unfalsifiable here; a derived overlay coincides with its own source in a screenshot, so per-mark geometry must be read from the **canvas backing store** via `getImageData` inside `page.evaluate` (#569, #572); sub-pixel marks want *peak*, not mean, alpha; short-lived effects need a per-frame in-page sampler, and the reading is one-directionally skewed (#571).

**Issues/PRs.** #443/#460 (runway geometry and the mid-screen playhead), #459 (pre-transform scroll clipping), #468 (far-edge fade), #488/#495 (spec 004: track-edit mode built; the phase-2 3D lift of the active track specified but **not built**), #541 (one shared render loop), #540 (`releaseFrames`; `TRACK_DATA_STORES`), #559/#568 (rhythm scalars and the `rhythms` store), #301 (open: toggle to show/hide the melody overlay — the nearest precedent for a view toggle), #168 (open: spatial audio/panning — unbuilt, which is why pan has no value to encode), #185 (open: i18n).

**Code.** `src/features/audio/AudioService.ts`; `src/features/spectrogram/{CQTAnalyser,SpectrogramCache,SpectrogramTileRenderer,TimelineRenderLoop,Spectrogram}.ts(x)`; `src/features/workstation/scrubber/{Scrubber,ScrubberTilt,useScrubberScroll,useScrubberGeometry,runwayConfig,runwayProjection}.ts(x)`; `src/features/workstation/{Mixer,Channel,Timeline,workstationReducer,workstationSignals,editModeSignals,useEditMode}.ts(x)`; `src/features/rhythm/{RhythmAnalyser,RhythmOverlay,BeatPulse,anchorBeatTimes}.ts(x)`; `src/features/transcription/MelodyExtractor.ts`; `src/features/project/{projectPageReducer,ProjectStorageService}.ts`; `src/shared/hooks/useAnimationFrame.ts`.

**Things the prompt named that do not exist in this repo.** Stated rather than invented:

| Named | Reality |
| --- | --- |
| `useAnimation` | No such hook. Three loops exist: `useAnimationFrame` (`src/shared/hooks/useAnimationFrame.ts`, a naked per-tick rAF used only by `MicLevelMeter`), the singleton `timelineRenderLoop` (`TimelineRenderLoop.ts` — `register({peekDirty, measure, write})`, one rAF for every mounted canvas, with a whole-frame idle short-circuit), and `useScrubberScroll`'s playback loop (runs only while `playbackState === 'playing'`; drives scroll, loudness, and `Playhead.render`). |
| "the spectrogram FFT size / hop / windowing" | There is no FFT. `CQTAnalyser.ts` is a **direct time-domain CQT** with precomputed per-bin kernels: `BINS_PER_OCTAVE = 24`, `MIN_FREQUENCY = 32.7` Hz (C1), `Q_FACTOR = 1/(2^(1/24) − 1) ≈ 34.1`, Hann window, per-bin kernel length `N_k = min(⌈Q·sr/f_k⌉, hopSize × 4)`, `HOP_SECONDS = 0.025`. Magnitudes are mapped to bytes over a **[−80, −30] dB** window, not full-scale. |
| "the delamination gesture" | Does not exist. The nearest built thing is **edit mode**: `editModeSignals.ts` + `useTrackCycleGesture.ts`, where a horizontal swipe on the runway cycles the active track and `Timeline.tsx`'s `getTimelineTrackClass` dims the rest. True geometric delamination (per-track `translateZ` lift) is spec 004 milestone 7 / **#495, open and unbuilt** — and `kb/domain.md` records why it was phased last (per-child depth needs `preserve-3d` on every ancestor and un-anchors from the playhead without a `runwayProjection` correction). |
| the `mawimbi-ribbons.jsx` prototype | **Still unseen.** Not in the repository, not supplied with the prompt, and the URL later offered for it 404s. Its parameter values are carried into the parameter table below **as reported in the prompt**, unverified. |
| spectral centroid, flux, harmonicity | Computed nowhere. A repo-wide grep finds no centroid, flux, flatness, or inharmonicity anywhere in `src/`. This is the single largest gap between what the design needs and what exists. |
| OKLCH | Used nowhere. Track colours are raw RGB triples (`COLOR_PALETTE` in `projectPageReducer.ts`, **five** entries, cycled deterministically by `nextColorId` — *not* randomized; `kb/verification.md` corrects that misconception explicitly). `src/index.css` uses HSL only for shadcn design tokens. |

**A sibling prototype was reviewed: "Mawimbi — radial wave field" (artifact `1a2387fa-d5a0-4cad-bd57-87c326ff86ab`, 2026-07-26).** It is *not* String mode and must not be read as one — it is a Chunk-scale runway variant where the source sits at bottom centre and wavefronts recede toward a horizon as they age (x → pan, y → age, height → loudness, spectrum stacked inside each ridge's own height, depth default 7 s). Its geometry (cone, camera/mouth ratio, haze) is depth-specific and does not transfer. Five things it surfaced *do* transfer, and each is marked **[RWF]** where it lands: the point-source legibility failure (Decision 1), the deterministic-noise requirement (Decision 1 and the verification design), the occlusion budget (open question 9), the spectrum-fills-available-height mapping (Decision 3 and open question 10), and the age-vs-pan axis conflict (channel table and open question 6). Its own use of HSL — `hsla(hue, 58+30·mag%, 17+45·mag%)`, so perceived lightness diverges across its four hues at equal magnitude — is a live demonstration of the OKLCH argument below rather than a counterexample to it.

## Goals

1. A String mode view renders one ribbon per audible track, horizontally stationary and pinned at both viewport edges, deforming in place from the track's own audio.
2. Pitch is encoded **redundantly** across ribbon height, ripple spatial frequency, and OKLCH lightness; loudness across thickness and chroma; hue carries track identity only.
3. Propagation is a pure function of persisted per-track data and `playback.getEngineTime()` — no live per-frame analysis on the critical path, so the rendering is reproducible and falsifiable.
4. Every per-frame visual value bypasses both reducers and reaches the DOM through refs inside the existing shared render loop; no React state update is introduced anywhere reachable from `useScrubberScroll`.
5. All five spectral features String mode needs (f0, loudness, brightness, flux, harmonicity) are derived in **one additional pass over the existing CQT frames**, inside the existing spectrogram worker, and persisted per track. No second analysis pipeline.
6. String mode composes with edit mode's focus/dim semantics without inventing its own attention mechanism, and degrades to a static, non-propagating rendering under `prefers-reduced-motion`.
7. The whole view holds an 8 ms per-frame main-thread budget at 8 tracks on a mid-range phone, or the shortfall is measured and reported rather than assumed.

## Non-goals

- **Replacing the runway timeline.** String mode is a Now-scale view; the runway stays the Chunk-scale view and stays the product's visual identity (`kb/product.md`). A user switches between them.
- **A Form-scale view.** Named in the hierarchy below so String mode has a place in it, specified nowhere.
- **Editing through the ribbon.** Wehinger's *Hörpartitur* never had to be inverted; ours eventually must, but v1 is read-only. The inverse gesture for each channel is an open question, not a deliverable.
- **Pan.** There is no pan value in the data model (`Track` has no pan field; #168 is open and unbuilt), so there is no percept to encode. Recorded as unresolved.
- **WebGL.** Deferred with a measurement plan, not rejected forever.
- **New DSP libraries.** Everything derives from the CQT frames this app already computes.

## Perceptual grounding

Each finding is tied to the decision it licenses. These are the load-bearing claims; if one is wrong, the design decision above it should move.

**Untrained listeners are not bad at hearing, only at labelling.** Bigand & Poulin-Charronnat (2006) find that implicit exposure gives non-musicians structural sensitivity comparable to trained listeners across a wide range of tasks; Rohrmeier & Rebuschat (2012) place this in the implicit-learning literature. *Consequence:* the design problem is **notational, not cognitive**. This is what licenses the whole enterprise — a piano roll and a spectrogram are not "too advanced" for a creative amateur (`kb/product.md`), they are optimised for the dimensions listeners are worst at naming and worst at reading off a grid. String mode does not simplify; it re-notates.

**Contour beats intervals.** Dowling (1978), and Dowling, Kwak & Andrews (1995): contour dominates melodic recognition at short delays, with interval information asserting itself only at longer ones. *Consequence:* at the Now scale — which is precisely the short-delay regime — pitch must be represented as **relative shape**, never as a grid of absolute values. This is the argument against a piano-roll grid in this mode, and the argument for ribbon *height above a moving local reference* rather than height on an absolute pitch axis.

**Cross-modal correspondences for pitch are early and robust.** Spence (2011) reviews pitch–elevation and pitch–size/brightness correspondences, present in infants by 3–4 months; the Köhler angular/rounded axis maps onto pitch as well. *Consequence:* height and lightness are safe defaults, and the angular/rounded axis licenses using **ripple waveform shape** (rounded sine vs. jagged noise) as a carrier for something real rather than as decoration.

**How people spontaneously draw sound.** Küssner & Leech-Wilkinson (2014): given a stylus, listeners encode pitch as height and loudness as stroke thickness, using pen pressure. Godøy, Haga & Jensenius (2006) and Godøy et al. (2016) on sound-tracing: pitch height and signal decay are traced consistently regardless of training, while **timbre tracings diverge sharply between individuals**. *Consequence:* height and thickness are shared vocabulary and can be relied on without instruction; texture is personal and must be *learnable* rather than assumed. Concretely, that is why harmonicity gets the ripple waveform (a channel a user can learn by watching one percussive track next to one sustained one) and not a primary geometric channel.

**Colour is emotion, not frequency.** Palmer, Schloss, Xu & Prado-León (2013): music-to-colour matches are mediated by emotional association (fast/major → lighter, more saturated, yellower; slow/minor → darker, desaturated, bluer), with correlations of 0.89–0.99 replicating across US and Mexican participants. *Consequence:* **hue must never encode pitch.** This is the single firmest prohibition in the design, and it disposes of the most common "obvious" mapping.

**Visual channel types.** Bertin, *Semiology of Graphics*: value/lightness is perceived as ordered, hue is not; position is the only channel that is simultaneously selective, associative, ordered and quantitative. *Consequence:* hue takes the nominal job (track identity), lightness takes an ordinal quantity (pitch/brightness), and position takes the most important continuous one (displacement).

**Pitch metaphors are language-specific.** Eitan & Timmers (2010); Shayan, Ozturk & Sicoli (2011): Farsi, Turkish and Zapotec speakers use thick/thin rather than high/low; Kreung uses tight/loose. *Consequence:* this is the direct justification for the **redundant** pitch encoding. Height serves high/low, ripple spatial frequency serves tight/loose, and lightness serves bright/dark — so the representation survives whichever metaphor the user brings, and no single channel has to be the right one.

**Listeners hear streams, not spectra.** Bregman (1990): auditory scene analysis groups by harmonicity, onset synchrony within ~30 ms, and frequency comodulation, and a stream may combine several physical sources. *Consequence:* this is the core argument against the spectrogram as a Now-scale view. A spectrogram depicts the mixture *before* the grouping the auditory system has already performed. **One ribbon per perceived stream, not per frequency bin.** Note the honest limit: this app's unit of grouping is the *track*, which is a proxy for a stream and not the same thing — a polyphonic track carries several streams, and that is an open question below.

**Timbre dimensions.** McAdams (2015); Caclin, McAdams, Smith & Winsberg (2005): spectral centroid (brightness), log attack time, spectral flux, and spectral irregularity recur as the salient dimensions across multidimensional-scaling studies. *Consequence:* these four are what the analysis pass must produce; nothing more exotic is warranted.

**Timescales.** Snyder (2000): echoic memory ~250 ms, short-term 3–5 s (10–12 s at the outside), and three levels of musical experience — event fusion, melody/rhythm, form. Godøy, Jensenius & Nymoen (2010): sound–action chunks of 0.5–5 s, where the most perceptually salient features live. Parncutt on the perceptual present: roughly 2–10 s, adaptive to event rate. *Consequence:* the three-scale hierarchy below, and the default memory horizon τ_mem = 1.2 s (inside echoic-to-short-term, at the low end of the chunk range because String mode is deliberately the *shortest* of the three).

**Precedent.** Wehinger's 1970 *Hörpartitur* for Ligeti's *Artikulation*: timeline in seconds, shapes and colours in place of a staff, dots for impulses, combs for noise, explicitly built for non-specialists. The crucial difference is that Wehinger's score is **descriptive and never had to be inverted**. Ours is an editing surface, so every visual channel eventually needs a working inverse — which is why the inverse gestures are an enumerated open question rather than a footnote.

## Design

### Where String mode sits: Form / Chunk / Now

| Scale | Span | Percept (Snyder / Godøy / Parncutt) | In this app |
| --- | --- | --- | --- |
| **Form** | 30 s – minutes | Snyder's third level: sections, repetition, arc | **Does not exist.** `MIN_PIXELS_PER_SECOND = 50` puts ~20 s in a 1000 px runway window at full zoom-out, so the timeline never reaches Form. |
| **Chunk** | 0.5 – 5 s | Godøy's sound–action chunk; Parncutt's perceptual present | **The existing runway.** At `DEFAULT_PIXELS_PER_SECOND = 200` and the `noteHighway` preset's canvas window, roughly 4.5 s is visible — the default zoom already lands inside Godøy's range, apparently by accident. |
| **Now** | 0.25 – 2 s | Echoic memory; event fusion | **String mode.** |

This is the first thing the spec fixes, because it settles what String mode *is*: not a better timeline, but the scale below the one the timeline covers. The runway keeps the product's visual identity and its "music coming towards you" metaphor; String mode is what you switch to when you want to watch the sound itself rather than its trace.

**Entry is an explicit view toggle, not a zoom threshold.** Precedent: the toolbar sheet pattern and #301's proposed melody-overlay toggle. Rationale in the decision record below.

### Decision 1 — Propagation: event-driven packets with mirror images

> **Decision.** Displacement is the superposition of **decaying wave packets**, one injected at the near (left) anchor per detected onset, travelling right at speed *c* set by pitch. Reflections at both anchors are produced by the **method of images** — each packet contributes a family of mirrored copies at alternating sign and attenuated amplitude — so `y(u, T)` is a **closed-form function of (onsets, envelopes, T)** with no state carried between frames. The finite-difference wave equation (option 3) remains the target for a later spec, for the one thing images cannot give: modal structure.
>
> **Rationale.** Three arguments, in order of weight.
>
> *(a) It is the only one of the three that this environment can falsify.* `kb/verification.md` records that this sandbox never delivers a single live worklet frame to the main thread, for any tap point (#542) — so any model forced by live per-frame analysis is unverifiable end to end here, and the same reasoning already drove `BeatPulse`'s design away from live spectral flux toward persisted ticks plus `getEngineTime()`. A closed-form packet sum over *persisted* onsets is a pure function, unit-testable at level 1 and reproducible frame to frame regardless of how the machine is loaded. That matters concretely: measured frame gaps in this sandbox run ~90 ms under load, i.e. ~11 fps (#571), and a stateful simulation stepped per frame would render differently on every run.
>
> *(b) For the undamped linear string, images are not an approximation of option 3 — they are its solution.* d'Alembert's solution on `[0, L]` with `y(0,t) = y(L,t) = 0` is exactly the free-space solution summed over odd, 2L-periodic image sources. So "reflections are emergent from the physics rather than a cosmetic mask" — the property that makes option 3 attractive — is preserved in closed form. This is the strongest reason to prefer 2 over 3 and it is not a compromise. Two honest caveats: once damping `γ·∂y/∂t` is added the 1D Green's function develops a **trailing wake** behind the front that a purely translating packet does not reproduce, and the image sum must be truncated (bounded by `M_max`), so both are approximations of the damped problem, not exact.
>
> *(c) It reads as plucking, which is the brief.* Option 1 (the prototype's `t − u·τ` delay-line window) reads as a scrolling window with a fade at each end, which is what we are trying to get away from, and it also fails a product rule: sampling a *linear* time window along `u` means the right half of the ribbon is a spatialized replay of the past with no event structure — a strip of film rotated 90°, which is exactly the layered-spectrogram timeline again.
>
> **Direction: left → right, near anchor on the left.** `kb/product.md` is explicit that visualizations must make the just-heard legible and must never use note-highway mechanics where approaching events strike a line. A packet injected at the left and travelling right encodes *age as distance from the excitation point* — the left edge is now, the right edge is τ_mem ago. Reflected energy returning leftward is old and visibly attenuated, which is honest. **Centre-out is rejected**: it halves the memory horizon for the same ribbon length and makes the two halves mutually redundant. (LTR reading order is assumed; RTL is listed as an open question, since #185 i18n is open.)
>
> **End pinning, and the excitation point `u₀`.** Displacement is multiplied by an anchor envelope `E(u) = (4u(1−u))^p_anchor`, zero at both ends and 1 at the centre. With images already enforcing sign inversion at the boundaries, this envelope is cosmetic smoothing rather than the mechanism — it exists so a truncated image sum cannot leave a visible discontinuity at the anchors.
>
> **[RWF] Packets are therefore injected at `u₀ > 0`, not at `u = 0`.** The first draft of this decision put the excitation point exactly at the near anchor, where `E(0) = 0` — so the newest event was multiplied by zero and **the freshest audio was invisible at the instant it arrived**, in a view whose entire justification is making the just-heard legible (`kb/product.md`). The radial-wave-field prototype hit the same failure from the other direction and states it plainly in its own source: *"A point source would squeeze every track to the same place at t = 0, making pan unreadable exactly where the meter is; giving the source real width is what keeps the near arc legible."* Generalised: **any encoding that converges to a point at the moment of maximum interest destroys its channel exactly where it matters most.**
>
> The fix is not a patch, because a real string is not plucked at the bridge. `u₀` is where the string is struck, it has a physical referent, and it has a *consequence* — pluck position determines which harmonics are excited (a guitar plucked near the bridge is brighter, because a node of the *n*th mode sits at `u = m/n` and plucking there cannot excite it). So `u₀` is a candidate carrier for timbral brightness, and under the FDTD target (option 3) that coupling is automatic rather than imposed. Age is then measured as distance travelled *from* `u₀`, and the segment `[0, u₀]` is the short backward-travelling stub that reflects almost immediately — which is what a real pluck looks like.

> **[RWF] The ripple's value noise must be a deterministic hash, never `Math.random`.** Harmonicity drives ripple waveform — sine for tonal, value noise for percussive — and `kb/verification.md` records that pinning `Math.random` for e2e determinism *silently silences `Tone.Reverb`*, with no error and no warning. A ripple built on `Math.random` would be flattened to a constant by that same established pin, so an assertion that percussive tracks ripple differently from tonal ones would pass or fail for reasons unrelated to the code under test. Use a hash of `(packet index, u)`; the radial-wave-field prototype uses `sin(i · 12.9898) · 43758.5453`, fract-ed, and says why in a comment: *"no Math.random, so every run renders identically."*
>
> **Degradation when Basic Pitch returns no f0.** Wave speed `c`, ripple spatial frequency `k_r`, and lightness `L` are all pitch-driven. When there is no confident note active at time T (silence, percussion, or a track Basic Pitch simply fails on — note `test-tone-short.wav` at 0.50 s produces no rhythm result at all, and classification declines anything under 2.1 s), all three fall back to the **spectral centroid**, which the envelope pass always produces. The ribbon therefore never freezes or flattens for want of a pitch; it renders brightness instead. This is also how the flagged pitch/brightness channel collision resolves — see Decision 3.
>
> **Dissent.**
> - *Adversary:* image truncation is a cliff. A packet near an anchor has its nearest images just outside the domain, so raising `M_max` changes the picture near the edges more than in the middle — the ends will look subtly wrong in a way that only shows on dense material. Mitigation: pin the anchor-region shape in a unit test across two `M_max` values and require agreement within tolerance.
> - *Architect:* onset-driven means the ribbon is **silent between onsets on sustained material**. A held organ chord has one onset and then nothing, so the string decays to rest while audio is plainly still playing. Accepted and answered: packets are onset-*triggered* but their amplitude envelope is driven by the per-frame loudness envelope, and a **continuous low-level forcing term** proportional to instantaneous loudness sustains a standing deformation between onsets. Without that, String mode is a drum visualizer.
> - *Simplicity:* the images are speculative until someone has watched the thing without them. Answered by making reflection amplitude `ρ` a parameter with 0 as a legal value — `ρ = 0` *is* the no-reflection build, so shipping the image machinery costs one loop and one sign flip, and turning it off is a config change rather than a rewrite.
> - *Performance:* dissents against option 3 more strongly than the recommendation admits. Option 3's real cost is not FLOPs (a CFL-stable grid needs ~7 sub-steps of 128 points per 16.7 ms frame — trivial arithmetic) but **statefulness**: the sim's frame depends on the whole forcing history, so a scrub or seek has no valid state to resume from, forcing either a visible reset or an expensive pre-roll. Whoever specs option 3 must specify a fixed-timestep accumulator keyed to engine time (never to the frame gap, which varies 20–90 ms here) plus a reset-and-pre-roll on seek, before anything else.

**What option 3 buys that this does not, and why it stays the target.** A finite-difference string has *modes*: the boundary conditions and `c` together determine a harmonic series, so the ripple pattern is not imposed but emerges, and the ribbon's standing-wave structure would encode pitch a second time with no extra mapping. That is a genuinely stronger claim than "we drew a sine at a pitch-dependent frequency," and it is the reason to keep 3 on the roadmap. It is not a reason to build it first.

### Decision 2 — Renderer: Canvas 2D with per-ribbon gradients

> **Decision.** Canvas 2D. One filled path per ribbon (top edge and bottom edge, `N` points each), coloured by a single `createLinearGradient` along the ribbon's long axis with ~32 stops. WebGL is deferred to a profiling issue.
>
> **Rationale.** The decisive argument is verification, not performance. This repo's primary tool for proving an overlay actually painted is reading the canvas's own backing store with `getContext('2d').getImageData` inside `page.evaluate` — established for beat rungs (#569), onset ticks (#570), phantom rungs (#572), and the arrival pulse (#571), and reached for precisely because a composited screenshot cannot attribute a pixel to a derived layer that coincides with its own source. That entire pattern is 2D-context-specific; on a WebGL canvas it becomes `readPixels` with `preserveDrawingBuffer` and same-frame timing, which is a real cost to pay on the first view in this app that has no existing pixel-level tests to inherit. There is also no WebGL anywhere in `src/` today — `FUTURE_PLANS.md` §2b contemplates it for tile compositing and it was never built — so String mode would be introducing a second rendering stack, context-loss handling included, in the same change that introduces a new visualization.
>
> The performance case does not force WebGL either. The cost that would push toward it is **per-point colour variation**, since lightness and chroma vary continuously along `u`. Per-segment quads (192 fills × 8 tracks = 1536 fills/frame) is where Canvas 2D hurts; a single gradient with ~32 stops per ribbon is 8 gradient constructions and 8 fills per frame, which is nothing. The quantization to 32 stops is invisible for a smooth lightness ramp across ~360 px.
>
> **Per-frame budget, mid-range phone, 8 tracks** — estimates, not measurements. Measuring them is a milestone.
>
> | Stage | Estimate | Note |
> | --- | --- | --- |
> | Packet superposition | ~0.4 ms | Iterate packets × their support (~16 grid points), not `N × M`. Capped by `M_max = 32`. |
> | Envelope sampling (5 scalars/track) | ~0.05 ms | Array index into the persisted envelope at `floor(T / 0.025)`. |
> | Path construction | ~0.3 ms | 2N = 320 `lineTo` per ribbon. |
> | Gradient + fill | ~1.5–3 ms | Fill area ≈ 8 × 360 × 60 ≈ 173k px — well inside a phone's fill rate. |
> | **Total** | **~2–4 ms** | Against an 8 ms budget (half of 16.7 ms, leaving room for the rest of the app). |
>
> At 4 tracks, halve it. The budget is stated so a milestone can falsify it; if measurement lands above 8 ms, the escape hatches in order are: drop `N` to 96, apply `lod_age` more aggressively, drop gradient stops to 16, then WebGL.
>
> **[RWF] Count fills per frame, and put the count on screen.** The radial-wave-field prototype instruments exactly this — a HUD reading `fps` and `fills/frame`, with a warning below 45 fps — and it is the right metric because fill count is what actually varies with the parameters under test. It also supplies useful calibration for how much headroom this design has: that prototype runs up to `ridges × tracks × bands` ≈ 44 × 4 × 6 ≈ **1,056 fills/frame** and warns about its own frame rate at defaults, whereas String mode's 8 gradient fills sit two orders of magnitude below it. That gap is the reason the Canvas 2D estimate above is plausible — and the reason it must still be measured rather than assumed, since it is the *count* that differs, not the underlying cost per fill.
>
> **[RWF] Level of detail by age.** The same prototype scales angular samples per wavefront as `max(6, round(detail × (1 − 0.6 r)))` — fewer samples for older, smaller, hazier content. The equivalent here is `lod_age` (parameter table): an old packet is attenuated and narrow on screen, so it does not need the full grid. Free, and it attacks the one term that scales with `M_max`.
>
> **Dissent.** *Performance:* gradient objects are allocated per frame, and `TimelineRenderLoop` exists partly to keep the loop allocation-free (#541). Eight small allocations per frame is well below the churn that motivated that rule, but it should be watched, and a gradient cache keyed on the quantized stop values is the cheap fix if GC shows up in a profile. *Product:* the runway's look is the product's identity and a flat 2D ribbon stack may read as a downgrade next to it; answered by keeping String mode a mode, and by the human-QA milestone.

### Decision 3 — One extra pass over the CQT frames, persisted per track

> **Decision.** A new `extractEnvelopes` step runs in the **existing spectrogram worker** (`spectrogram.worker.ts`, alongside `AnalyseRequest` / `MelodyRequest` / `RhythmRequest`) over the CQT frames `analyseCQTChunked` has already computed, and emits five Float32Array envelopes **plus one downsampled band vector** at the CQT's own 25 ms hop:
>
> | Envelope | Derivation from a CQT frame `m[k]`, k = 0…numberBins−1 | Percept |
> | --- | --- | --- |
> | `rms` | `sqrt(Σ m[k]² / n)` | Loudness |
> | `centroid` | `Σ k·m[k] / Σ m[k]`, **in bin units** | Timbral brightness |
> | `flux` | `‖m_t − m_{t−1}‖₂`, half-wave rectified | Spectral flux; attack character |
> | `flatness` | geometric mean / arithmetic mean of `m[k]` | Harmonicity **proxy** |
> | `f0Bin` | argmax over the lowest strong peak, or `NaN` | Pitch fallback when no melody note is active |
> | `bands` **[RWF]** | `m[k]` max-pooled into `B = 8` log-spaced bands, `Uint8`, **normalized per frame to its own peak** | Spectral distribution across the ribbon's cross-section |
>
> **[RWF] Why the band vector, and why per-frame normalization.** Five scalars cannot express *shape*, and the radial-wave-field prototype demonstrates what shape buys: it stacks the whole spectrum inside each ridge's own height, so *"the shape always fills whatever height the moment has. Loudness scales it; it never truncates it."* Under this spec's mapping without bands, a quiet high note is both thin (loudness → thickness) and light (pitch → lightness) — that is, nearly invisible, which is the same class of failure as the point-source one in Decision 1. With bands, the ribbon's cross-section carries a normalized spectral gradient (low content at one edge, high at the other) that stays fully legible at any thickness, and thickness goes back to meaning loudness alone. Per-frame normalization is what makes that true — an absolute band vector would fade with loudness and reintroduce the problem it was added to solve. Pool with **max, never sum**: `kb/domain.md` records that summing overflowed `Uint8Array` values mod 256 and corrupted the spectrogram (#152, #195), and max also preserves the strongest component per band.
>
> Cost: 8 bands × 1 byte × 40 fps × 180 s ≈ **58 KB** per 3-minute track, against ~144 KB for the five Float32 envelopes — the cheapest field in the row.
>
> **Rationale.** The constraint was "reuse the existing spectrogram pipeline; do not add a parallel analysis path," and this satisfies it literally — the same frames, in the same worker, in one extra loop, with no new dependency. Two properties are worth calling out. First, the centroid is computed **in CQT bin units**, which are log-spaced at 24 bins/octave; a bin-domain centroid is a log-frequency centroid, which is arguably a better brightness correlate than the conventional linear-Hz one and is free here. Second, `kb/domain.md`'s standing rule — *every analysis path must share the CQT bin definition* — is satisfied by construction, because there is no second frequency mapping to drift.
>
> **The blocking constraint the prompt could not know: the frames are gone.** `SpectrogramCache.releaseFrames` empties `frequencyFrames` once the spectrogram is persisted, to bound memory (#540) — which is exactly why `SpectrogramData.totalFrames` exists as its own field. So a restored track has tiles and no frames, and String mode cannot compute anything from `entry.data.frequencyFrames` at render time. This forces the design: **derive at analysis time, persist the result**, exactly as `rhythms` does for ticks and onsets. Size is not a problem — a 3-minute track is 7200 frames × 5 floats ≈ 144 KB.
>
> **Storage.** A new `envelopes` object store, `keyPath: 'trackId'`, `DB_VERSION` 4 → 5. Per CLAUDE.md's rule it is added to `TRACK_DATA_STORES` so both `deleteProject` and `deleteTrackData` sweep it with no second list to drift. Per `kb/decisions.md` (2026-07-25), its **restore read is part of adding the store, not a follow-up**: `useSpectrogramCache`'s `loadOrAnalyse` gets a `restoreOrExtractEnvelopes()` called from *both* branches, never nested inside `if (storedSpectrogram)` — that nesting is the bug that shipped twice already, for rhythm (#577) and melody (#579).
>
> **The pitch/brightness collision on lightness, resolved.** The channel table assigns lightness to pitch *and* names brightness as an alternative. They do not compete: lightness always means "how high or bright is this sound," and the estimator behind it switches — an active `MelodyNote`'s `midiNote` when one exists, `centroid` otherwise. For pitched material the two are strongly correlated anyway, so the channel is stable across the switch rather than jumping. Concretely: `L = lerp(L_min, L_max, normalize(pitchOrCentroid))` where the normalization maps the same log-frequency range in both cases, so the seam is continuous.
>
> **Dissent.** *Adversary:* spectral flatness is a proxy for harmonicity, not harmonicity — a dense but perfectly harmonic cluster reads as noisy, and a narrowband noise reads as tonal. Accepted, and flagged: essentia's `Inharmonicity` (requires `SpectralPeaks` + a pitch estimate) is the principled alternative and essentia is already loaded in this worker (`essentiaLoader.ts`), so the upgrade path is short. Flatness is chosen first because it needs zero new calls and can be falsified immediately against `test-arrhythmic-noise.wav` vs. `test-tone-10s.wav`. *Simplicity:* five envelopes is more than v1 needs; `flux` is only used for attack hardness. Answered by the marginal cost being one loop over frames that are in memory anyway, and by the alternative — adding a store later — being the expensive move.

### Decision 4 — Per-frame values bypass both reducers

> **Decision.** String mode registers **one callback pair with the existing `timelineRenderLoop`** rather than starting its own rAF loop, reads all changing values from a `latestRef` updated on every render (the `Spectrogram.tsx` pattern), and writes only to canvas and to inline styles. Nothing per-frame touches `projectPageReducer` or `workstationReducer`.
>
> **Rationale.** Three repo-specific rules converge here.
>
> (1) *State updates at 60 Hz are a known failure mode*, which the prompt already knew. What it could not know is the sharper local version: **any `useState` whose setter fires from an effect reachable from `useScrubberScroll` kills the Scrubber's signal subscriptions entirely** — the #114 class, re-measured while building spec 008 M5, where even a no-op `setCached(null)` broke scroll-sync and scrub-to-pause and surfaced as two unrelated-looking assertion failures. `anchorBeatTimes.ts` is the worked answer: the same derivation as the hook, as a memoizing plain class the rAF loop calls, with no React in it. String mode's per-frame derivation must take that shape.
>
> (2) *One rAF for the app.* `TimelineRenderLoop` replaced N per-track loops precisely so that idle frames cost nothing (#541). String mode joining it inherits the idle short-circuit for free.
>
> (3) *Therefore `peekDirty` must be exactly right.* The rule from `RhythmOverlay.tsx` and `Spectrogram.tsx`: **for every early return in `write`, mirror the condition in `peekDirty`** — a state `write` declines to handle is a state whose sentinels never advance, so the callback reports dirty forever and holds the *whole* loop out of idle, making every mounted track pay. For String mode the shape is: dirty while playing or while any packet is above the visibility floor; **not dirty** when stopped and the string is at rest. `e2e/spectrogram-render-loop.spec.ts`'s idle-frame test is the guard, and it caught this class on CI rather than locally.
>
> Note also that `workstationReducer`'s `WorkstationState.pixelsPerSecond` is vestigial — no action writes it, and zoom actually lives in `workstationSignals.ts`. Do not extend the reducer for String mode's view state; a signal in `workstationSignals.ts` (or a sibling module) matches how zoom already works and gives bridge hooks the `signals` accessor the architecture expects.

### Decision 5 — Composition: outside the tilt, inside edit mode's semantics

> **Decision.** String mode's ribbon stack renders **outside** `ScrubberTilt`, in a flat stack laid out against the same drawer-adjusted visible box the runway solves. It reuses edit mode's focus/dim semantics rather than inventing an attention mechanism. Switching between the runway and String mode is a mode transition, not a nesting.
>
> **Rationale.** The requirement "pinned at both ends of the viewport" and the runway's `rotateX(70deg)` perspective are incompatible: under the tilt a horizontal line projects to a trapezoid chord whose width depends on its depth, so a ribbon rendered inside the tilt would have its ends somewhere other than the viewport edges, at a width that varies per track. The prompt asks how String mode composes with the runway wrapper at Chunk scale; the honest answer is that at Now scale it cannot be inside it. What it *can* reuse is the geometry module's existing flattened variant — `useScrubberGeometry`'s `getFlatVariant`, which already exists to serve `prefers-reduced-motion` and derives a flat version of whichever preset is active rather than hard-switching to the `flat` preset. That gives the ribbon stack the runway's visible box and drawer-height accounting with no new layout math.
>
> **Attention.** `kb/product.md`'s "one stream, focusable sources" rule applies unchanged: ribbons stack semi-transparently at `α_layer` and per-ribbon emphasis represents selective attention. Edit mode already owns that vocabulary — `editModeSignals.ts`, the horizontal-swipe `useTrackCycleGesture`, and `Timeline.tsx`'s `getTimelineTrackClass` opacity classes. String mode reads the same `activeEditTrackId` signal and applies the same treatment, so a user who has learned it on the runway does not learn it twice, and per-track dimming needs no code of its own (the mechanism that already makes onset ticks inherit their track's opacity, `kb/decisions.md` 2026-07-26).
>
> **"Delamination"** — the `d_sep` parameter below — is *vertical lane separation within the flat stack*: at 0 the ribbons overlap on one baseline (maximally "one stream"), at 1 they occupy disjoint lanes. That is deliberately **not** the same thing as spec 004 M7 / #495's 3D `translateZ` lift, which is a runway feature, is unbuilt, and carries the `preserve-3d`-through-every-ancestor hazard `kb/domain.md` documents. Reusing the word for a 2D layout parameter would guarantee confusion; the spec uses "lane separation" and reserves "delamination" for #495.
>
> **Reduced motion.** Under `prefers-reduced-motion`, propagation freezes: `c = 0`, `M_max` collapses to the packets active at the current instant, and the ribbon renders its standing envelope only. The shape still responds to the audio; nothing travels.

## Channel allocation

Recorded, not relitigated. All colour is specified in **OKLCH**.

| Percept | Channel | Notes |
| --- | --- | --- |
| Track / stream identity | Hue (OKLCH H) | Nominal. Capacity ~6–8 on thin marks; today's palette is **5** (`COLOR_PALETTE`). Beyond that, **lane position** is the fallback second channel — Bertin's only fully selective + ordered + quantitative channel — backed by the mixer's existing per-track instrument icon as a legend. |
| Pitch | Ribbon height **and** ripple spatial frequency **and** lightness (OKLCH L) | Redundant by design (Eitan & Timmers; Shayan et al.). Height serves high/low, `k_r` serves tight/loose, L serves bright/dark. |
| Loudness | Thickness **and** chroma (OKLCH C) | Thickness is the spontaneous mapping (Küssner & Leech-Wilkinson). |
| Timbral brightness | Lightness | Not a competitor to pitch — the *same* channel with a fallback estimator (Decision 3). |
| Attack character | Leading-edge hardness | Godøy's impulsive / sustained / iterative taxonomy, driven by `flux` and log attack time. |
| Harmonicity | Ripple waveform: sine for tonal, value noise for percussive | A real grouping cue (Bregman), not decoration. Driven by `flatness`. |
| Pan | **Undecided at Now scale** | Two reasons, and the second is the real one. (a) No `Track.pan` field exists and #168 is open, so there is nothing to encode yet. (b) **[RWF] The lateral axis can carry age or pan, not both** — this spec spends it on age (distance from `u₀`), while the radial-wave-field prototype spends it on pan and puts age on depth. That is the actual trade, and no gutter resolves it. See open question 6. |

**Why OKLCH and not HSL.** At fixed HSL lightness, *perceived* lightness varies enormously with hue — HSL `L = 50%` yellow is far lighter than HSL `L = 50%` blue. Since lightness carries pitch here, the same note would read as a different pitch on a different-coloured track, and the redundant encoding would actively fight itself. OKLCH's L is perceptually uniform by construction, so a pitch→L mapping means the same thing on every track's hue. This is not a preference; it is the condition under which the redundant pitch encoding is coherent at all. Practical consequences: the five `COLOR_PALETTE` RGB triples must be converted to OKLCH once and stored (or a parallel OKLCH palette introduced); chroma must be **gamut-clamped per hue** before conversion to sRGB, because the maximum achievable C differs by hue and an unclamped high-chroma value silently clips, distorting the loudness channel exactly where it matters most.

## Parameter table

Every tunable, with the perceptual quantity it controls. Prototype-derived defaults are marked ‡ and are unverified (the prototype is not in this repo).

| Symbol | Name | Units | Range | Default | Perceptually controls |
| --- | --- | --- | --- | --- | --- |
| `c` | Wave speed | string-lengths/s | 0.5 – 8 | 3.3 ‡ (= 1 / 0.3 s crossing) | How fast a pulse crosses; **set by pitch** |
| `τ_mem` | Memory horizon | s | 0.25 – 5 | 1.2 ‡ | How much history the ribbon holds |
| `γ` | Packet damping | 1/s | 0.2 – 4 | 0.83 (= 1/τ_mem) | Decay rate; driven by spectral decay |
| `σ` | Packet width | string-lengths | 0.01 – 0.2 | 0.06 | Event "sharpness" on the string |
| `A_max` | Max displacement | fraction of lane height | 0 – 1 | 0.45 | Loudness → height ceiling |
| `w_min` / `w_max` | Thickness | px | 1 – 24 | 2 / 14 | Loudness → stroke thickness |
| `k_r` | Ripple spatial frequency | cycles/string-length | 2 – 40 | pitch-mapped (12 at A3) | Pitch, redundantly (tight/loose) |
| `a_r` | Ripple depth | fraction of A | 0 – 1 | 0.5 ‡ ("warble depth") | Ripple legibility |
| `p_anchor` | End-anchor exponent | — | 0 – 4 | 1.0 ‡ | How hard the ends are pinned |
| `u₀` **[RWF]** | Excitation point | string-lengths | 0.05 – 0.5 | 0.15 | **Where the string is plucked.** Must be > 0 or the newest event is multiplied by `E(0) = 0` and is invisible (Decision 1). Physically couples to brightness. |
| `B` **[RWF]** | Spectral bands | count | 4 – 16 | 8 | Cross-section spectral gradient resolution |
| `lod_age` **[RWF]** | Sample falloff with age | — | 0 – 0.8 | 0.6 | Grid points per packet scale as `1 − lod_age·age/τ_mem` — older packets are smaller on screen and need fewer samples |
| `ρ` | Reflection coefficient | — | 0 – 1 | 0.55 | Energy retained per bounce; **0 disables images** |
| `M_max` | Max active packets | count | 8 – 64 | 32 | Cost cap; image-sum truncation |
| `N` | Grid resolution | points | 64 – 256 | 160 | Ribbon smoothness vs. cost |
| `α_layer` | Per-ribbon opacity | — | 0 – 1 | 0.61 ‡ | "One stream" legibility |
| `d_sep` | Lane separation | fraction of stack height | 0 – 1 | 0.5 ‡ ("delaminate") | Overlap vs. per-track separation |
| `L_min` / `L_max` | Lightness range | OKLCH L | 0 – 1 | 0.35 / 0.92 | Pitch/brightness |
| `C_max` | Max chroma | OKLCH C | 0 – 0.37 | 0.16 | Loudness (gamut-clamped per hue) |
| `t_attack` | Leading-edge hardness | s | 0.002 – 0.15 | from log attack time | Impulsive vs. sustained |
| `f_floor` | Packet visibility floor | fraction of A_max | 0 – 0.2 | 0.02 | Below this a packet is retired — **also the idle condition for `peekDirty`** |

## Verification design

Levels per `kb/verification.md`. The controlling environmental facts: no live worklet frames reach the main thread here (#542); frame gaps run ~90 ms under load (#571); a derived overlay coincides with its own source in a composited screenshot, so canvas backing-store readback is the primary reading (#569, #572).

| Goal | Verification | Level | Artifact |
| --- | --- | --- | --- |
| 1 (ribbon renders, pinned) | Backing-store readback: for each ribbon, column 0 and column W−1 have displacement within `ε` of the lane baseline while an interior column does not | e2e canvas readback | `e2e/string-mode.spec.ts` |
| 2 (redundant pitch encoding) | Two fixtures an octave apart → height, `k_r` (peak count across the ribbon), and L each move monotonically and in the same direction | unit + e2e readback | `stringChannels.test.ts`, `e2e/string-mode.spec.ts` |
| 2 (hue is identity only) | Two tracks at the *same* pitch with different palette entries have equal L, different H | unit | `stringChannels.test.ts` |
| 3 (propagation is pure) | `displacementAt(onsets, envelopes, T)` is deterministic; the same T twice returns identical arrays; packet centres advance by exactly `c·Δt`; a packet crossing `u = 1` reappears with inverted sign and amplitude `× ρ` | unit | `ribbonPropagation.test.ts` |
| 3 (image truncation is stable) | Anchor-region profile agrees between `M_max = 16` and `M_max = 64` within tolerance — the Adversary's dissent, made falsifiable | unit | `ribbonPropagation.test.ts` |
| 3 (no-f0 degradation) | With an empty melody, `c`/`k_r`/`L` fall back to centroid and stay finite; ribbon is non-flat | unit | `ribbonPropagation.test.ts` |
| 4 (no per-frame React state) | `peekDirty` returns false when stopped and all packets are below `f_floor`; the shared loop's window-read counter stays flat over N idle frames | unit + e2e | `timelineRenderLoop.test.ts`, `e2e/spectrogram-render-loop.spec.ts` (extend) |
| 4 (no state in the scrubber's tree) | Structural: no `useState` in the String-mode render path; plus the existing Scrubber scroll-sync and scrub-to-pause tests stay green — the #114 tripwire | unit | `Scrubber.test.tsx` (existing, as regression) |
| 5 (envelopes from real audio) | Real CQT on committed fixtures: `test-chirp-10s.wav` centroid rises monotonically; `test-tone-10s.wav` flatness ≪ `test-arrhythmic-noise.wav` flatness; `test-click-120bpm.wav` flux peaks within ±70 ms of ground-truth clicks | unit (real analysis) | `envelopeExtraction.fixtures.test.ts` + `e2e/fixtures/envelopeGroundTruth.mjs` |
| 5 (persist + restore) | Reload asserts the **branch**, not the values: restore log present *and* extract log absent — deterministic recomputation cannot prove provenance | e2e | `e2e/string-mode-persistence.spec.ts` |
| 5 (store cleanup) | `envelopes ∈ TRACK_DATA_STORES`; single-track delete removes the row | unit | `ProjectStorageService.test.ts` (extend) |
| 6 (edit-mode composition) | Ribbon contrast drops on the non-active track across an edit-mode toggle **while a control layer holds** — the two-population pattern from #570 | e2e readback | `e2e/string-mode.spec.ts` |
| 6 (reduced motion) | With `emulateMedia({reducedMotion:'reduce'})`, packet centres do not advance between two engine times | e2e | `e2e/string-mode.spec.ts` |
| 6 (mode transition, feel) | Does switching read as a change of scale or a change of app? Does the ribbon read as a plucked string? | **human QA** | checklist issue (#467 pattern) |
| 7 (frame budget) | Measure the four stages on a real mid-range device; close if under 8 ms at 8 tracks | **profiling issue** | issue with measurement plan (#469 pattern) |
| — (colour) | OKLCH → sRGB round-trips within ΔE tolerance; chroma clamps inside gamut for every palette hue | unit | `oklch.test.ts` |
| **[RWF]** ripple determinism | Ripple value noise is identical across two runs **with `Math.random` stubbed to a constant** — the pin that silently silences `Tone.Reverb` (`kb/verification.md`) must not flatten percussive ripple. Falsify by swapping the hash for `Math.random()` and requiring the test to fail. | unit | `ribbonPropagation.test.ts` |
| **[RWF]** newest event is visible | Displacement at the packet injected at `T` is above `f_floor` **at its own frame**, not one frame later — the `E(0) = 0` regression, pinned. Falsify by setting `u₀ = 0`. | unit | `ribbonPropagation.test.ts` |
| **[RWF]** occlusion budget | Fraction of the rearmost ribbon's painted pixels surviving the full stack stays above a floor at default `A_max`/`d_sep`/`α_layer`, on a dense 8-track mix | e2e canvas readback | `e2e/string-mode.spec.ts` |
| — (colour-blind safety) | Simulated deuteranopia/protanopia/tritanopia separation between palette hues | **human QA** + unit sim | checklist issue |

**New verification infrastructure required — this is Milestone 1:**

1. `e2e/helpers/ribbonProfile.ts` — reads a ribbon canvas's backing store and returns, per column, the top edge, bottom edge, and peak alpha. *Peak, not mean*: a sub-pixel-positioned edge straddles two or three rows depending on where its centre lands, so its mean row alpha varies with sub-pixel placement while its peak does not (`rhythm-runway.spec.ts`'s `readRungRows` for the same reason).
2. `e2e/fixtures/envelopeGroundTruth.mjs` — expected centroid/flatness/flux behaviour per existing fixture, in the shape of `rhythmGroundTruth.mjs`. **No new WAV fixtures are likely to be needed**: `test-chirp-10s.wav` is a linear 200 → 4000 Hz sweep and therefore a moving-centroid fixture by construction, `test-arrhythmic-noise.wav` (continuous noise) and `test-tone-10s.wav` should bracket flatness, and the click fixtures bracket flux. **Verify before building on it**, and note one trap: `test-chirp-10s.wav` and `test-arrhythmic-noise.wav` are produced by `e2e/fixtures/generate-wav.mjs`, but `test-tone-10s.wav` predates that generator and is *not* in it — its content is inferred from its name, its 10 s duration and `kb/verification.md`'s treatment of it, not read from a source. Confirm it is actually a steady tone (or regenerate it into the generator) before making it the tonal half of a flatness assertion.
3. `window.__mawimbi.stringMode` — a DEV-gated bridge (`src/global.d.ts`, wired in `AudioService.ts`, `import.meta.env.DEV`) exposing `getEnvelopes(trackId)` and `getPacketsAt(trackId, t)`, so propagation state is readable at level-1 fidelity through the real pipeline. Same role `window.__mawimbi` already plays for worker-produced melody data.

## Milestones

Each independently landable and verifiable. Verification infrastructure is first, so every later milestone lands with its checks already runnable.

1. **Verification harness.** `ribbonProfile.ts`, `envelopeGroundTruth.mjs`, the `stringMode` DEV bridge. Confirm the existing-fixtures claim above; commit new fixtures only if it fails.
2. **Envelope extraction and persistence.** `extractEnvelopes` in `spectrogram.worker.ts`; the `envelopes` store (`DB_VERSION` 5) added to `TRACK_DATA_STORES`; `restoreOrExtractEnvelopes()` called from **both** branches of `loadOrAnalyse`. Verified by the fixture test and the branch-asserting reload e2e.
3. **Colour.** OKLCH module, palette conversion, per-hue gamut clamping, the pitch/brightness lightness mapping with its fallback seam. Pure functions, unit-tested. No rendering yet.
4. **Propagation.** `displacementAt(onsets, envelopes, T)` — packets, images, anchor envelope, continuous loudness forcing, no-f0 degradation. Pure, unit-tested, still no rendering.
5. **Renderer and view toggle.** Canvas 2D ribbon stack outside the tilt, registered with `timelineRenderLoop` with a `peekDirty` that mirrors every early return in `write`. View-mode signal in `workstationSignals.ts` (not the reducer). Verified by canvas readback and the idle-frame test.
6. **Composition.** Edit-mode focus/dim reuse, reduced-motion freeze, the runway ↔ String transition, lane separation.
7. **Polish, QA and profiling handoff.** Full-suite run, the human-QA checklist issue (feel, colour-blind safety, whether ribbons read as strings), the profiling issue with the four-stage budget, and `/kb write`.

Milestones 3 and 4 are independent of each other and both depend only on 1–2; 5 depends on 3 and 4.

## Open questions

Each with the experiment that would settle it.

1. **Does ripple phase lock to the beat or to pitch?** Witek et al. on the inverted-U relationship between syncopation and groove suggests entrainment is worth *showing*, and this app already has an induced beat grid (`induceBeatGrid.ts`) and an arrival envelope (`BeatPulse.ts`) to lock to. But pitch already owns spatial frequency, and beat-locking phase while pitch owns frequency may read as two unrelated motions. *Experiment:* build both behind a parameter on the same take at a confident tempo (`MIN_TEMPO_CONFIDENCE = 1.1`); ask listeners which one they can tap along to. Falsifiable, cheap, and needs no new data.
2. **How does a polyphonic track behave as a single ribbon?** Bregman's argument is one ribbon per *stream*, and a track is a proxy for a stream, not the same thing. Basic Pitch is polyphonic and returns overlapping `MelodyNote`s, so the data to split on exists. *Experiment:* render a piano chord as (a) one ribbon at the lowest note, (b) one at the loudest, (c) one ribbon per simultaneous note within a track, and check whether (c) is legible at `α_layer = 0.61` or just noise.
3. **What is the inverse gesture for each channel?** This is what separates our surface from Wehinger's descriptive score, and none of it is specified. *Experiment:* paper-prototype drag-height → transpose, drag-thickness → gain, pinch-ripple → ? on a phone, and find which channels have no plausible inverse; those may need to become read-only annotations rather than channels.
4. **Colour-blind-safe hue sets.** Five palette entries are cycled deterministically; nothing has ever been checked for deuteranopia/protanopia/tritanopia. *Experiment:* simulate the palette under each, measure minimum pairwise separation in OKLCH, and expand to the lane-position fallback earlier than 6–8 tracks if separation fails.
5. **Is τ_mem = 1.2 s right, and should it adapt to event rate?** Parncutt's perceptual present is explicitly adaptive to event rate. *Experiment:* compare fixed 1.2 s against `τ_mem = k / onsetRate` (the onset rate is already computed) on a dense and a sparse take.
6. **[RWF] Pan — and the lateral-axis conflict behind it.** Nothing to encode until #168 lands, but the harder question is prior to that: the lateral axis can carry **age or pan, not both**. This spec spends it on age; the radial-wave-field prototype spends it on pan (with a Gaussian lateral lobe, `exp(−((u − pan)/lobe)²)`, `lobe` default 0.30) and moves age to depth. That prototype's axis assignment implies a **fourth propagation formulation** the original three did not enumerate: a **pan-indexed standing ribbon** — no travel along the string at all, `u` is the stereo field, and the whole ribbon deforms in place as a standing shape. Recorded, not adopted: it makes the pinned ends genuinely meaningful (hard left / hard right) and it would settle pan outright, but it trades away the travelling-pulse percept that is the entire brief. *Experiment:* build it behind the same parameter surface as the packet model — it is a small addition once `displacementAt` exists — and ask whether "where is it in the room" beats "when did it happen" at the Now scale. If it does, spec 009 has the wrong axis assignment and Decision 1 needs reopening, not amending.
7. **RTL.** Left→right encodes age as distance. In an RTL locale (#185), does that invert with the reading direction, or is it a physical metaphor that should not? *Experiment:* ask, rather than guess.
8. **Does the continuous loudness forcing term make the string legible on sustained material, or just permanently wobbly?** The Architect's dissent in Decision 1 identifies the failure mode; a held organ chord is the fixture.
9. **[RWF] What is the occlusion budget?** `A_max`, `d_sep` and `α_layer` jointly decide whether a loud track's excursion hides the ribbons behind it — and hiding the history destroys precisely what this view exists to show (`kb/product.md`: the runway is short-term auditory memory). The radial-wave-field prototype states this as its central design constraint in its own legend — *"push Height up until near peaks start swallowing the history behind them; that boundary is the real design constraint"* — and this spec has no equivalent. Unlike most legibility questions it is **measurable, not just a QA judgement**: render the stack twice, once with only the rear ribbon and once with all of them, and compute the fraction of the rear ribbon's painted pixels that survive. *Experiment:* sweep `A_max × d_sep` on a dense 8-track mix, find the surviving-fraction contour where the history stops being readable, and make the resulting ceiling a clamp rather than a tuning note.
10. **[RWF] Should the ribbon's cross-section carry the spectral gradient, and does it collide with lightness?** Decision 3 now persists an 8-band vector so it can, and the prototype shows the mapping works (spectrum fills whatever height the moment has; loudness scales, never truncates). The unresolved part is interaction: this spec already uses **lightness for pitch**, so a lightness gradient *across* the ribbon for spectrum plus an overall lightness *level* for pitch may be one lightness channel too many. *Experiment:* render both, plus a variant where the cross-section gradient is chroma rather than lightness, on a track with a wide spectrum and a moving pitch.

## Rejected alternatives

Recorded so they are not reopened without new evidence.

- **Pitch → hue.** The firmest prohibition in the design. Palmer et al. (2013) show music-to-colour association is mediated by *emotion*, with correlations of 0.89–0.99 replicating cross-culturally; and Bertin's channel taxonomy says hue is not perceived as ordered at all, so a pitch→hue mapping is unreadable as a magnitude even before the emotional confound. Hue stays nominal.
- **A piano-roll grid in this mode.** Dowling (1978) and Dowling, Kwak & Andrews (1995): contour dominates at short delays, and the Now scale *is* the short-delay regime. A grid of absolute values optimises the dimension listeners are worst at there. (The app keeps its piano-roll overlay on the runway, where longer delays make interval information relevant — the two are not in conflict.)
- **A vertical timeline for this mode.** The vertical orientation is load-bearing for the runway and was chosen *for* the perspective effect (#358, `kb/product.md`) — but String mode has no scrolling axis at all, so there is nothing for verticality to serve, and a vertical ribbon fights the pitch→height correspondence (Spence 2011) by using the same axis for two things.
- **The raw spectrogram at Now scale.** Bregman: a spectrogram depicts the mixture *before* the grouping the auditory system has already performed. At the Chunk scale that is a feature — it is the nuance layer `kb/product.md` describes, and it stays. At the Now scale, where event fusion is the operative percept, it shows the listener something they have already stopped hearing separately.
- **Option 1, the delay-line window** (Decision 1). Reads as a scrolling window with end fades; spatially replays the past with no event structure.
- **WebGL first** (Decision 2). Not on performance grounds — on verification grounds, plus a second rendering stack.
- **Reusing "delamination" for lane separation** (Decision 5). The word belongs to #495's unbuilt 3D lift.

## References

- Bertin, J. (1967/1983). *Semiology of Graphics: Diagrams, Networks, Maps.* University of Wisconsin Press.
- Bigand, E., & Poulin-Charronnat, B. (2006). Are we "experienced listeners"? A review of the musical capacities that do not depend on formal musical training. *Cognition*, 100(1), 100–130.
- Bregman, A. S. (1990). *Auditory Scene Analysis: The Perceptual Organization of Sound.* MIT Press.
- Caclin, A., McAdams, S., Smith, B. K., & Winsberg, S. (2005). Acoustic correlates of timbre space dimensions: A confirmatory study using synthetic tones. *Journal of the Acoustical Society of America*, 118(1), 471–482.
- Dowling, W. J. (1978). Scale and contour: Two components of a theory of memory for melodies. *Psychological Review*, 85(4), 341–354.
- Dowling, W. J., Kwak, S., & Andrews, M. W. (1995). The time course of recognition of novel melodies. *Perception & Psychophysics*, 57(2), 136–149.
- Eitan, Z., & Timmers, R. (2010). Beethoven's last piano sonata and those who follow crocodiles: Cross-domain mappings of auditory pitch in a musical context. *Cognition*, 114(3), 405–422.
- Godøy, R. I., Haga, E., & Jensenius, A. R. (2006). Playing "air instruments": Mimicry of sound-producing gestures by novices and experts. In *Gesture in Human-Computer Interaction and Simulation* (LNCS 3881), 256–267.
- Godøy, R. I., Jensenius, A. R., & Nymoen, K. (2010). Chunking in music by coarticulation. *Acta Acustica united with Acustica*, 96(4), 690–700.
- Godøy, R. I., Song, M., Nymoen, K., Haugen, M. R., & Jensenius, A. R. (2016). Exploring sound-motion similarity in musical experience. *Journal of New Music Research*, 45(3), 210–222.
- Küssner, M. B., & Leech-Wilkinson, D. (2014). Investigating the influence of musical training on cross-modal correspondences and sensorimotor skills in a real-time drawing paradigm. *Psychology of Music*, 42(3), 448–469.
- McAdams, S. (2015). Perception and cognition of musical timbre. In *The Oxford Handbook of Music Psychology* (2nd ed.). Oxford University Press.
- Palmer, S. E., Schloss, K. B., Xu, Z., & Prado-León, L. R. (2013). Music–color associations are mediated by emotion. *PNAS*, 110(22), 8836–8841.
- Parncutt, R. (various). On the perceptual present and its relation to event rate in rhythm perception.
- Rohrmeier, M., & Rebuschat, P. (2012). Implicit learning and acquisition of music. *Topics in Cognitive Science*, 4(4), 525–553.
- Shayan, S., Ozturk, O., & Sicoli, M. A. (2011). The thickness of pitch: Crossmodal metaphors in Farsi, Turkish, and Zapotec. *The Senses & Society*, 6(1), 96–105.
- Snyder, B. (2000). *Music and Memory: An Introduction.* MIT Press.
- Spence, C. (2011). Crossmodal correspondences: A tutorial review. *Attention, Perception, & Psychophysics*, 73(4), 971–995.
- Wehinger, R. (1970). *Hörpartitur* for György Ligeti's *Artikulation.* Schott.
- Witek, M. A. G., Clarke, E. F., Wallentin, M., Kringelbach, M. L., & Vuust, P. (2014). Syncopation, body-movement and pleasure in groove music. *PLoS ONE*, 9(4), e94446.
