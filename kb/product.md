# Product

Facts about what Mawimbi is for and the rules that shape feature decisions. Cite the relevant entries when writing a spec; challenge an entry (with evidence) rather than silently contradicting it.

## Vision and target user

- Mawimbi is a music creation app for the **creative amateur**: "Create music, easy and intuitive." Ease and immediacy win over pro-audio feature depth. (README, `docs/index.md`)
- The core promise is **visual**: "Visualize and manipulate sounds like you hear them." Tracks are colorful spectrograms, not waveforms — the spectrogram/runway rendering is the product's identity, not decoration.
- **The timeline is vertical on purpose** (epic #358, sub-issues #359–#363): time flows top-to-bottom toward the playhead, spectrograms transposed (low frequencies left, high right), because "a vertical timeline better matches the metaphor of music *coming towards you*" — and to enable the perspective/runway depth effect. The runway is not decoration bolted onto the timeline; the vertical orientation was chosen *for* it.
- **Two layers of perception, two renderings.** Mawimbi visualizes both what psychoacoustics treats as the perceptual/conceptual *categorization* of music audio (tones, notes, instruments — the 12-TET grid) and the continuous *nuance* that is always present alongside it (the full frequency-content distribution). Display surfaces pick their magnitude mapping to match the layer they serve: the spectrogram keeps a compressive dB scale so weak content stays visible (nuance), while the playhead meter uses an expansive transfer so fundamentals/peaks dominate (categorization). Neither mapping is a bug to "unify". (Owner statement 2026-07-19; applied in spec 003.)

## Business rules

- **Local-first, no accounts.** Projects persist to IndexedDB in the browser; there is no backend. Deployed as a static site on Netlify (https://mawimbi.netlify.app/). Any feature requiring a server needs explicit product sign-off first.
- **Mobile is a first-class target.** Bottom sheets, dynamic-viewport (`dvh`) work, touch gestures, and on-device QA issues (e.g. #467) all assume phone use. Desktop-only interactions (hover, fine pointer) must have a mobile equivalent — see PR #458, where a hover-gated control had to move into the mobile overflow menu.
- **Recording follows the GarageBand workflow** (mechanics: CLAUDE.md, RecordingService). The product rule behind it: the deliberate arm → position → play sequence is the point — don't collapse it into a one-button record flow.
- **The count-in's real job is masking startup latency** (#199): the 4-beat visual count (~120 BPM, no audio click) deliberately absorbs the mic-permission dialog and recorder startup by opening the microphone at count-in start, and plays existing tracks so the musician hears context before capture begins. The early mic-open is not an ordering accident. Tempo-aware count-in awaits beat tracking (#165).
- **The mixer stacks the newest track on top** — a product requirement from 2020 (#20), and the intent behind `Mixer.tsx`'s reversed render array (mechanism: CLAUDE.md). Don't "simplify" the reversal away.
- **Dark theme is the default**; light theme must keep working (a light-theme glow-color inversion shipped as a bug once, fixed in PR #456).
- **ML features run entirely in the browser** (Web Workers + WASM/ONNX). No inference service; model downloads must be cached (`ModelCache`).
- **Hosted models are a supply-chain risk, and caching is resilience, not just speed:** the original classification model (`Xenova/clap-large`) was removed from HuggingFace and began returning 401 in production within days of integration (#176, #244). Any new ML feature must assume its hosted model URL can vanish — `ModelCache` (Cache API, stale-while-revalidate with ETag, #229) exists partly for this.

## Prioritization signals

- Long-term direction lives in `FUTURE_PLANS.md` and open issues labeled `future-plan`. **Caveat:** `FUTURE_PLANS.md` was last updated 2026-02-28 and several sections have since shipped (§4 recording/count-in via #199, #202, #209–#219; §7a pinch-zoom via #196) or been superseded (§1a–1c by CQT, see kb/domain.md) — verify against code before executing a plan from it.
- Visual polish of the runway/spectrogram area is actively invested in (issues #443–#469); regressions there are treated as serious.
