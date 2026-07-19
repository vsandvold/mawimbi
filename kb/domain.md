# Domain

Audio/music domain knowledge that explains *why* the features work the way they do. Architecture and code layout live in CLAUDE.md; this file is the domain reasoning behind them.

## Analysis and visualization

- **CQT (constant-Q transform), not linear FFT**, drives the spectrograms: constant-Q spacing is logarithmic in frequency, so each octave gets equal visual height and musical pitch maps to consistent vertical distance. That is what makes the "see sounds like you hear them" promise hold. (`features/spectrogram/`)
- **Two analysis paths** exist because their latency budgets differ: offline CQT analysis renders uploaded audio into cached tiles (`OfflineAnalyser`, `SpectrogramCache`); live worklet analysis (`LiveCQTAnalyser`, `AnalysisProcessor`) renders the in-progress recording frame-by-frame (~25ms hop). When recording completes, the rough live rendering is replaced by the polished offline result — the same live-then-refine pattern is planned for pitch (issue #302).
- **Melody transcription** uses Spotify `basic-pitch`; **instrument classification** uses essentia.js features + an ONNX model. Both run in Web Workers to keep the UI and audio threads clean.

## Timing and mixing

- **`Tone.Transport` is the single timeline clock.** All track playback, the playhead, and recording alignment derive from it; never introduce a second clock.
- **Loudness normalization on upload** (`LoudnessNormalizer`) exists so tracks recorded/uploaded at wildly different levels mix at comparable loudness without the user touching faders first — an amateur-friendliness rule, not an audio-engineering nicety.
- **Latency compensation** (`features/recording/LatencyCompensation`): a recorded overdub is captured late relative to what the user heard (output latency + input latency), so the recording is shifted back before being placed on the timeline. Background research: `FUTURE_PLANS.md` (low-latency overdubbing).

## Audio engine

- Tone.js builds on `standardized-audio-context`, which wraps the native `AudioContext` in a proxy that tracks every node it creates in an internal registry. `Tone.getContext().rawContext` returns that **wrapper**, so connecting a wrapper-created node to a native node fails the registry lookup and throws "value with the given key could not be found" ([Tone.js #712](https://github.com/Tonejs/Tone.js/issues/712)). This is why native-node code paths must build their *entire* chain on the extracted native context — the actionable pattern lives in CLAUDE.md ("Tone.js context is not the native AudioContext").

## Runway geometry (playhead/scrubber)

Two physical facts govern all runway work; the decisions built on them are in `kb/decisions.md` (2026-07-18/19 entries):

- Under perspective, the layout→screen mapping is **nonlinear** — any linear-fraction shortcut (CSS `calc`, `cqh` padding) looks right in the flat case and drifts under real tilt.
- Scroll clipping happens in **pre-transform layout space** — a scroll container inside the tilt clips content before `rotateX` can project it into view (the #459 bug class).
