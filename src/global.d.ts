import type SpectrogramCache from './features/spectrogram/SpectrogramCache';

declare global {
  interface Window {
    TONE_SILENCE_LOGGING: boolean;
    webkitOfflineAudioContext: OfflineAudioContext;
    /**
     * Dev-only e2e verification bridge (mawimbi#480) — read-only access to
     * service state that e2e tests cannot otherwise observe (worker-produced
     * data with no DOM/CSS surface, e.g. transcribed melody notes). Never
     * set outside `import.meta.env.DEV`, so it does not exist on deployed
     * builds; e2e always runs against `npm start` (playwright.config.ts).
     */
    __mawimbi?: {
      spectrogramCache: SpectrogramCache;
    };
  }
}

export {};
