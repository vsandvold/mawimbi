import type SpectrogramCache from './features/spectrogram/SpectrogramCache';
import type SpectrogramStats from './features/spectrogram/SpectrogramStats';
import type PlaybackService from './features/playback/PlaybackService';
import type { hasActivePreviewOverlay } from './features/spectrogram/previewOverlayRegistry';

declare global {
  interface Window {
    TONE_SILENCE_LOGGING: boolean;
    webkitOfflineAudioContext: OfflineAudioContext;
    /**
     * Dev-only e2e verification bridge (mawimbi#480) — read-only access to
     * service state that e2e tests cannot otherwise observe (worker-produced
     * data with no DOM/CSS surface, e.g. transcribed melody notes; the real
     * Tone.Transport position, which a pinch-zoom test would otherwise have
     * to re-derive from scrollTop/pixelsPerSecond — exactly the kind of
     * pixel-math proxy this bridge exists to avoid, mawimbi#476). Never set
     * outside `import.meta.env.DEV`, so it does not exist on deployed
     * builds; e2e always runs against `npm start` (playwright.config.ts).
     *
     * `sampleRate` (mawimbi#484) lets the sparkle e2e reproduce the exact
     * `computeNumberBins`/bar-count math the live CQT analyser uses to
     * derive an expected sparkle x position, rather than assuming a sample
     * rate the test environment may not actually use.
     *
     * `spectrogramStats` (mawimbi#538, spec 006 milestone 1) exposes the
     * spectrogram subsystem's perf/memory accounting — per-track tile/frame
     * byte counts and analysis timing, plus global draw/read counters — so
     * later milestones' e2e suites can assert on measured numbers instead
     * of guessing from pixels or wall-clock timing.
     *
     * `previewOverlay` (mawimbi#543, spec 006 milestone 6) reports whether
     * a track currently has a live effects-preview overlay showing — the
     * overlay itself lives in React state local to each `Spectrogram`
     * mount, with no other DOM/CSS surface an e2e test could poll.
     *
     * `debugGetGlobalContextName` (mawimbi#554) reports the process-global
     * Tone context's class name — the only way an e2e test can observe
     * whether something stranded it on a defunct `OfflineContext` (see
     * `renderTrackOffline.ts`'s module comment) instead of the real,
     * always-`'Context'` live app context.
     *
     * `getRhythm` (mawimbi#567, spec 008 milestone 1) exposes worker-produced
     * rhythm data (beat ticks, tempo, confidence, onsets) the same way
     * `getMelody` exposes transcribed notes — no DOM/CSS surface an e2e test
     * could otherwise read this from.
     */
    __mawimbi?: {
      spectrogramCache: Pick<
        SpectrogramCache,
        'getMelody' | 'getRhythm' | 'getEntry'
      >;
      spectrogramStats: Pick<SpectrogramStats, 'getTrackStats' | 'getCounters'>;
      playback: Pick<PlaybackService, 'getEngineTime'>;
      previewOverlay: { hasOverlay: typeof hasActivePreviewOverlay };
      sampleRate: number;
      debugGetGlobalContextName: () => string;
    };
  }
}

export {};
