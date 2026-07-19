# Product

Facts about what Mawimbi is for and the rules that shape feature decisions. Cite the relevant entries when writing a spec; challenge an entry (with evidence) rather than silently contradicting it.

## Vision and target user

- Mawimbi is a music creation app for the **creative amateur**: "Create music, easy and intuitive." Ease and immediacy win over pro-audio feature depth. (README, `docs/index.md`)
- The core promise is **visual**: "Visualize and manipulate sounds like you hear them." Tracks are colorful spectrograms, not waveforms — the spectrogram/runway rendering is the product's identity, not decoration.

## Business rules

- **Local-first, no accounts.** Projects persist to IndexedDB in the browser; there is no backend. Deployed as a static site on Netlify (https://mawimbi.netlify.app/). Any feature requiring a server needs explicit product sign-off first.
- **Mobile is a first-class target.** Bottom sheets, dynamic-viewport (`dvh`) work, touch gestures, and on-device QA issues (e.g. #467) all assume phone use. Desktop-only interactions (hover, fine pointer) must have a mobile equivalent — see PR #458, where a hover-gated control had to move into the mobile overflow menu.
- **Recording follows the GarageBand workflow** (mechanics: CLAUDE.md, RecordingService). The product rule behind it: the deliberate arm → position → play sequence is the point — don't collapse it into a one-button record flow.
- **Dark theme is the default**; light theme must keep working (a light-theme glow-color inversion shipped as a bug once, fixed in PR #456).
- **ML features run entirely in the browser** (Web Workers + WASM/ONNX). No inference service; model downloads must be cached (`ModelCache`).

## Prioritization signals

- Long-term direction lives in `FUTURE_PLANS.md` and open issues labeled `future-plan`.
- Visual polish of the runway/spectrogram area is actively invested in (issues #443–#469); regressions there are treated as serious.
