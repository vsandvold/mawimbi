import type SpectrogramCache from './features/spectrogram/SpectrogramCache';
import type SpectrogramStats from './features/spectrogram/SpectrogramStats';
import type PlaybackService from './features/playback/PlaybackService';

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
     */
    __mawimbi?: {
      spectrogramCache: Pick<SpectrogramCache, 'getMelody'>;
      spectrogramStats: Pick<SpectrogramStats, 'getTrackStats' | 'getCounters'>;
      playback: Pick<PlaybackService, 'getEngineTime'>;
      sampleRate: number;
    };
  }
}

export {};
