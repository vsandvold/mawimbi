# 005 — Recording: input monitoring, live pitch, punch-in/out

**Status:** Draft
**Date:** 2026-07-21
**Issues:** (filled by /spec-to-issues)

## Summary

Extends the recording feature along the three lines the open issue backlog plans for it: input monitoring while recording (#171), a live pitch trace on the in-progress recording (#302, reconciled with the Basic Pitch migration), and punch-in/out recording over an existing track (#174). The spec also documents the current recording solution as the baseline it builds on — including the live spectrogram during recording, which already shipped and needs no new work. Target user is the creative amateur overdubbing takes on a phone or laptop (`kb/product.md`).

## Current solution (baseline)

What exists today, so requirements below are diffs against reality rather than re-plans of shipped work:

- **Workflow** — GarageBand-style `idle → armed → recording → idle` state machine (`RecordingService.ts`); the deliberate arm → position → play sequence is a product rule, not an accident (`kb/product.md`). Arm via toolbar, then a 4-beat visual count-in (~120 BPM) masks mic-permission and recorder startup latency while playing existing tracks as context (#199; `useCountIn` in `workstationEffects.ts`). The transport is locked and spacebar blocked during count-in/recording.
- **Capture** — AudioWorklet PCM capture (`WorkletRecorder` + `RecordingProcessor`) on the extracted native `AudioContext`, with `Tone.Recorder` as silent fallback (#209, #210; decision 2026-03-03 in `kb/decisions.md`). Low-latency `getUserMedia` constraints bypass `Tone.UserMedia.open()` (#219; `MicrophoneService.LOW_LATENCY_CONSTRAINTS`). Mono, echo-cancellation/noise-suppression/AGC off.
- **Alignment** — `LatencyCompensation` trims the recorded buffer by `outputLatency + baseLatency + lookAhead + one render quantum` (#209); trimming the buffer rather than passing an offset downstream is deliberate (#212, `kb/domain.md`).
- **Live spectrogram** — already shipped. `FrequencyVisualizer` (worklet CQT preferred, main-thread CQT fallback) feeds `RecordingBuffer`, which accumulates one pixel row per ~25 ms hop on the recording track's canvas; when recording stops, the rough live rendering is replaced by the polished offline tiles — the live-then-refine pattern (`kb/domain.md`, "Two analysis paths"). This spec adds no live-spectrogram work; the live pitch trace (Goal 3) rides on this existing pipeline.
- **Completion** — `stopOverdubRecording()` returns the trimmed buffer + transport start time; `useMicrophone` creates a new track (`createRecordedTrack`), persists audio, dispatches `ADD_TRACK`, and pauses at position. Melody transcription (Basic Pitch) then runs in the background like for any track (`useSpectrogramCache.ts`), so the piano-roll overlay appears on recorded tracks after a delay — the "post-recording refinement" half of #302 effectively already ships.
- **Not routed to output** — the microphone connects only to its meter/analyser, never to `Tone.Destination`; there is currently no software feedback loop (#171's own analysis).

## Grounding

- KB: `kb/product.md` — GarageBand workflow rule; count-in masks startup latency (#199); mobile is first-class; local-first. `kb/domain.md` — worklet recording rationale, latency compensation design (#209/#212), `Tone.UserMedia` constraint bypass (#219), two analysis paths + live-then-refine "planned for pitch (issue #302)", `Tone.Transport` is the single clock. `kb/decisions.md` — 2026-03-03 (AudioWorklet capture, MediaRecorder rejected), 2026-03-09 (Basic Pitch replaces MELODIA — makes #302's MELODIA references stale), 2026-07-20 (`window.__mawimbi` dev-only e2e bridge), 2026-02-22 (undo = command history; `AudioSourceRepository` buffers deliberately never disposed in-session), 2026-07-18 (tap-to-seek rejected; seeking is drag-only). `kb/verification.md` — real Basic Pitch transcription is viable and deterministic in e2e (#480); prefer direct state reads for data claims; rect assertions lie under 3D transforms.
- Issues/PRs: #171 (input monitoring, §4c), #174 (punch-in/out, §4f), #302 (live pitch during recording — stale halves identified above), #175 (multi-take, §4g — out of scope), #170 (latency compensation — shipped and closed; the manual calibration tool within it was deliberately not built, `kb/domain.md`), #165 (beat tracking — prerequisite for tempo-aware count-in and marker snapping, not this spec), #274/#300 (piano-roll overlay, shipped), #199/#202/#209–#219 (recording epic, shipped), #494 (post-effect spectrogram refresh — same cache-invalidation concern punch splicing has).
- Code: `src/features/recording/` (all files), `src/features/workstation/workstationEffects.ts` (`useCountIn`, `useMicrophone`), `src/features/spectrogram/` (`FrequencyVisualizer`, `AnalysisProcessor`, `WorkletAnalyser`, `LiveCQTAnalyser`, `RecordingBuffer`, `PianoRollRenderer`, `Spectrogram.tsx`), `src/features/tracks/TrackService.ts`, `e2e/recording.spec.ts` (fake-device flags + mic permission already wired).

## Goals

1. **Deterministic capture proof:** an e2e test records from a synthetic 440 Hz microphone stream and proves, via the `window.__mawimbi` bridge, that the resulting track transcribes to MIDI 69 — closing the loop capture → latency trim → track creation → transcription.
2. **Input monitoring (#171):** while the microphone is open (count-in and recording), the user can toggle hearing themselves through the output, with a monitor volume slider. Off by default; enabling shows a feedback warning; a measured round-trip latency > 50 ms shows a latency warning.
3. **Live pitch trace (#302, live half):** during recording, a pitch trace renders on the in-progress recording's canvas at the existing ~25 ms analysis cadence, driven by a pitch detector running alongside the CQT in `AnalysisProcessor`.
4. **Refinement continuity (#302, refine half):** when recording stops, the live trace disappears with the live spectrogram and the existing Basic Pitch piano-roll overlay takes over — no MELODIA work, no second transcription path.
5. **Punch-in/out (#174):** from a chosen existing track, the user can re-record a section: position the playhead, arm punch, count in, record, stop — and the recorded span is spliced into that track's audio (crossfaded at the boundaries, latency-compensated), replacing the original content in that range. The splice is undoable and restores the original audio exactly.
6. **No regression:** the existing recording flow (arm, count-in, record to a new track, cancel) keeps its current behavior; the existing recording/audio e2e suites stay green.

## Non-goals

- **Multi-take recording (#175)** — needs a take-stack data model; separate spec when prioritized.
- **Timeline range markers for punch** — #174 as written asks for in/out markers on the timeline; deferred. Draggable markers on the tilted runway conflict with the drag-only-seek decision (`kb/decisions.md` 2026-07-18) and the known unreliability of hit-testing on the 3D plane (`kb/verification.md`), and useful markers want beat-grid snapping (#165). Punch range is transport-anchored instead (see Design). Revisit markers when #165 lands.
- **Manual latency calibration** — the click-track calibration tool sketched in #170 was deliberately not built when the computed compensation shipped (`kb/domain.md`); that stays the mechanism.
- **Tempo-aware count-in** — awaits beat tracking (#165); count-in stays 4 beats at ~120 BPM.
- **essentia `PitchYinFFT` in the AudioWorklet** — #302's implementation sketch predates the Basic Pitch migration and would introduce a WASM load path into the audio thread; superseded by a pure-TS detector (see Design). #302's MELODIA refinement step is likewise superseded — refinement is the shipped Basic Pitch path.
- **Stereo capture, monitoring effects (reverb-in-headphones), recording-time metronome click** — out of scope.

## Design

### Decision 1 — Punch model: transport-anchored destructive splice, no marker UI

> **Decision:** Punch is an action on a specific existing track. The user enters it from that track's edit sheet ("Punch over this track", enabled only when the playhead is at or after the track's start), positions via the existing scrubber, and the normal count-in flow runs. Punch-in = the engine time when capture starts; punch-out = when the user stops (extension past the original track end is allowed and grows the buffer). The recorded span is spliced destructively into the track's `AudioBuffer` with short equal-power crossfades at the boundaries, via a pure `spliceBuffer()` function and a new `TrackService.replaceTrackAudio()` + `REPLACE_TRACK_AUDIO` reducer action whose reverse action restores the previous audio.
> **Rationale:** Architect: this reuses the arm → position → count-in → record machinery wholesale and mirrors the shipped undo pattern (command history with reverse actions; `AudioSourceRepository` buffers are deliberately retained in-session, so holding the pre-punch buffer for undo is free — `kb/decisions.md` 2026-02-22). Passing a whole replacement buffer, not an offset, follows the #212 lesson. Simplicity: no new data model (a track stays one buffer + startTime) and no new timeline interaction surface. Product: "fix this bit, starting here" matches the amateur's mental model; range markers are pro-DAW furniture. A non-destructive region/overlay model was rejected: it changes the track data model project-wide for a feature undo already covers.
> **Dissent:** Product (minority) argued visible in/out markers communicate the punch range better than an invisible transport anchor, and that stop-as-punch-out risks sloppy punch tails. Recorded as the trigger to revisit when #165's beat grid enables snapping markers. Adversary flagged the splice-position math as the likely bug site: punch positions are engine-time based (`playback.getEngineTime()`, never `transportTime` — the CLAUDE.md gotcha) and must be converted to buffer-local offsets against the track's own `startTime` after latency trimming; this is why the splice is a pure function with sample-accurate unit tests before any UI exists.

### Decision 2 — Live pitch: pure-TS YIN in the existing AnalysisProcessor

> **Decision:** A pure-TypeScript YIN pitch detector (cumulative-mean-normalized-difference variant) runs inside `AnalysisProcessor` alongside the existing CQT, enabled only while recording, posting `{ type: 'pitchData', frequency, confidence }` at the CQT hop cadence. The live trace is buffered next to `RecordingBuffer`'s frames and drawn on the recording track's overlay canvas. Refinement is the already-shipped Basic Pitch path — when recording stops, live trace and live spectrogram are discarded together and the offline tiles + piano-roll overlay replace them.
> **Rationale:** Architect: the worklet already hosts pure-TS DSP (FFT, CQT) — YIN is ~150 lines in the same mold, with no new load path; essentia WASM in an AudioWorklet (per #302's sketch) would be a new, unproven-in-this-repo loading mechanism on the audio thread. Verification: a pure function is unit-testable with synthetic tones; a WASM-in-worklet path is not falsifiable in vitest. Product: the trace must not make systematic octave errors while the user sings — the rejected cheaper option (argmax over the existing live CQT bins) picks the strongest harmonic, not the fundamental, and low-frequency CQT resolution is deliberately capped (`MAX_KERNEL_HOPS`, #242), so it would read wrong exactly when it matters; YIN estimates the fundamental by construction. Noisiness relative to the refined result is accepted (#302: "expected and acceptable").
> **Dissent:** Simplicity predicted CQT-argmax would be good enough for a rough trace and ship in a day. If YIN's audio-thread cost measurably causes dropouts (Performance lens's risk), the fallback is CQT-argmax behind the same `pitchData` message shape — the interface is designed so the detector is swappable.

### Decision 3 — Input monitoring: a monitor gain inside MicrophoneService, warn-don't-block

> **Decision:** `MicrophoneService` owns a `monitorGain` (`Tone.Gain`) that, when monitoring is enabled, connects the existing `Tone.UserMedia` source to `Tone.Destination` — entirely inside the Tone graph, independent of the native-context capture path. A headphone-icon toggle plus volume slider live in the recording UI, active whenever the mic is open (so monitoring works during count-in, where the mic already opens early — `kb/product.md`). Monitoring defaults to off each session. Enabling it shows a feedback warning toast (headphone detection on the web is unreliable, so warn always rather than gate); if `estimateRoundTripLatency()` exceeds 50 ms, a latency warning shows too (#171's thresholds).
> **Rationale:** Architect: the mic already lives in the Tone graph (its meter connection proves the wrapper path works); only the recording capture path needs native nodes, and monitoring never touches it. Adversary: echo cancellation is deliberately off for music capture (#219), so speaker feedback is a real and fast failure — hence default-off and an unconditional warning; a "detected headphones" gate would be false confidence built on `enumerateDevices` label heuristics. Simplicity: no attempt at zero-latency native monitoring paths until the measured Tone-graph latency is shown to be a problem on real devices (that measurement is the human-QA issue).
> **Dissent:** Performance argued for building the monitor chain on the native context (like the recorder) to shave wrapper overhead; rejected as speculative — no measurement shows the Tone path's latency is worse, and the native path costs the established-but-fragile `_nativeContext` extraction for no proven gain. Recorded so the on-device QA issue checks perceived monitoring latency explicitly.

### Decision 4 — Verification: replace the fake beep with a controllable synthetic microphone

> **Decision:** Milestone 1 builds `e2e/helpers/fakeMicStream.ts`: a `page.addInitScript` override of `navigator.mediaDevices.getUserMedia` that returns an `OscillatorNode → MediaStreamAudioDestinationNode` stream at a known frequency, with a `window.__setFakeMicFrequency(hz)` control for changing pitch mid-test. All new recording e2e assertions build on it plus the existing `window.__mawimbi.spectrogramCache` bridge (melody notes are already readable through it).
> **Rationale:** Chrome's `--use-fake-device-for-media-stream` beep has no contractually known frequency, so it can prove "a track was created" (as `recording.spec.ts` does today) but not "the right audio was captured". A known tone turns capture, latency trim, splice, and live pitch into data-level assertions: recorded track transcribes to MIDI 69 (#480 proved Basic Pitch e2e is deterministic on pure tones); a punch with the oscillator switched to 660 Hz yields a track whose melody reads 440-tone before the punch range and 660-tone inside it — verifying the splice by listening to the result, not by trusting buffer math twice.
> **Dissent:** Simplicity noted the override must be installed before app scripts run and adds one more layer of fakery to maintain; accepted because every alternative (asserting on real beep content, exposing capture buffers wholesale through the bridge) is more fragile or wider.

## Verification design

| Goal | Verification | Level | Artifact |
| --- | --- | --- | --- |
| 1 | Record ~3 s from the 440 Hz fake mic; poll `__mawimbi.spectrogramCache` melody for the new track → notes contain MIDI 69 | e2e invariant | `e2e/recording-pitch.spec.ts` |
| 2 | Monitor routing state machine: enabling connects mic→gain→destination, disabling disconnects, slider sets gain via the dB conversion, close() tears down; warning shown when latency estimate > 50 ms | unit | `src/features/recording/__tests__/MicrophoneService.test.ts` |
| 2 | Toggle + slider exist while armed/recording; enabling raises the feedback warning toast; state resets next session | e2e invariant | `e2e/recording.spec.ts` (extended) |
| 2 | Audibility, perceived monitoring latency, real feedback behavior on phone speaker vs headphones | human QA | checklist issue (pattern #467) |
| 3 | YIN detector: synthetic sine, harmonic-rich (fundamental weaker than harmonics), and noise frames → detected f0 within ±1 semitone; noise → low confidence; no NaN across the frequency range | unit | `src/features/spectrogram/__tests__/yin.test.ts` |
| 3 | While recording the 440 Hz fake mic, live pitch frames read through the bridge have median MIDI 69; switching the oscillator mid-recording moves the median | e2e invariant | `e2e/recording-pitch.spec.ts` |
| 4 | After stop: live buffers cleared, melody data present for the new track (data-level read per `kb/verification.md` — paint of the overlay is the existing piano-roll path, already covered) | e2e invariant | `e2e/recording-pitch.spec.ts` |
| 5 | `spliceBuffer()`: samples before punch-in identical to original, inside identical to insert (post-crossfade), after punch-out identical to original; crossfade windows are equal-power ramps of the configured length; extension past original end grows the buffer; boundary cases (punch at 0 relative offset, punch to exact end) | unit | `src/features/recording/__tests__/PunchSplice.test.ts` |
| 5 | Full punch flow: record 440 Hz base track → punch its middle at 660 Hz → melody reads 440-note(s) outside range, 660-note inside; track count unchanged; undo restores the original melody and duration | e2e invariant | `e2e/recording-punch.spec.ts` |
| 5 | `REPLACE_TRACK_AUDIO` produces a reverse action restoring prior audio; `replaceTrackAudio` invalidates the spectrogram/melody cache for the track | unit | reducer + TrackService tests |
| 6 | Existing suites unchanged and green | e2e | `e2e/recording.spec.ts`, `e2e/audio.spec.ts` |

New verification infrastructure required (Milestone 1): `e2e/helpers/fakeMicStream.ts` (controllable synthetic microphone), plus a small `__mawimbi` bridge extension exposing the live pitch frame buffer during recording (DEV-only, same scoping rules as the existing bridge entry).

## Milestones

1. **Verification harness** — `fakeMicStream.ts` helper; `e2e/recording-pitch.spec.ts` proving Goal 1 (440 Hz in → MIDI 69 out through the full shipped pipeline). No app code changes beyond none-or-trivial.
2. **Input monitoring (#171)** — monitor gain + toggle/slider UI + warnings; unit + e2e rows for Goal 2; file the on-device QA checklist issue as part of the milestone.
3. **Live pitch detector** — pure-TS YIN in `AnalysisProcessor`, `pitchData` message, `WorkletAnalyser`/`FrequencyVisualizer` plumbing, recording-only enablement; unit tests (Goal 3 unit row). No rendering yet.
4. **Live pitch overlay** — pitch frame buffer beside `RecordingBuffer`, trace rendering on the recording canvas, bridge exposure; e2e rows for Goals 3–4.
5. **Punch splice core** — `spliceBuffer()`, `TrackService.replaceTrackAudio()`, `REPLACE_TRACK_AUDIO` with reverse action, cache/persistence invalidation (`saveAudioData` overwrite, spectrogram + melody re-analysis — same concern class as #494); unit tests (Goal 5 unit rows).
6. **Punch workflow + UI** — edit-sheet entry point, punch-mode arm carrying the target track, stop-path branch (splice instead of `ADD_TRACK`), guards (playhead ≥ track start; punch unavailable while another recording is active); `e2e/recording-punch.spec.ts` (Goal 5 e2e row) and Goal 6 regression run.

Milestones 2, 3–4, and 5–6 are independent of each other; all depend on 1.

## Open questions

1. **Punch entry-point placement** — the edit sheet is the chosen home ("Punch over this track"), but a long-press on the record button was also floated. Resolve with owner input before Milestone 6; the workflow behind the button is unaffected.
2. **YIN parameters** — window size (2048 vs 4096 at 44.1/48 kHz), f0 search range (proposal: ~65 Hz–1.5 kHz, voice/instrument fundamentals), confidence threshold for drawing a frame. Resolve by tuning against the unit fixtures plus one real sung recording during Milestone 3.
3. **Crossfade length** — default 10 ms equal-power; ear-check on device in the Milestone 2 QA issue (add a punch item to the same checklist when Milestone 6 lands).
4. **Monitoring persistence** — per-session off is specced; if QA shows users re-enable it every time with headphones, consider persisting the preference per project (would need a product sign-off, not assumed here).
5. **Live trace visual form** — continuous line vs note blocks. Start with a thin trace (cheapest, clearly "rough"); the refined piano-roll blocks visually distinguish the polished result. Revisit only if QA says the trace reads as broken rather than rough.
