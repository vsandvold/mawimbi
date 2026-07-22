import { analyseCQTFromAudioBuffer } from './CQTAnalyser';

export type SpectrogramData = {
  frequencyFrames: Uint8Array[];
  timeResolution: number;
  frequencyBinCount: number;
  sampleRate: number;
  duration: number;
  // Frame count at analysis time (mawimbi#540, spec 006 M3) — retained as
  // its own field rather than left derivable from `frequencyFrames.length`
  // or re-derived from `duration`/`timeResolution`, so it survives
  // `SpectrogramCache.releaseFrames` (which empties `frequencyFrames`) and
  // stays correct even if a future analysis path's frame-count formula
  // ever diverges from `duration / timeResolution`.
  totalFrames: number;
};

class OfflineAnalyser {
  private audioBuffer: AudioBuffer;

  constructor(audioBuffer: AudioBuffer) {
    this.audioBuffer = audioBuffer;
  }

  /**
   * Constant-Q Transform analysis producing log-frequency spectrogram frames.
   *
   * Delegates to the CQT analyser which computes a true Constant-Q
   * Transform with uniform Q-factor across all frequency bins. Produces
   * 24 bins/octave from 32.7 Hz (C1) to Nyquist — the single analysis
   * path used by all visualizations.
   */
  analyseToFrames(): SpectrogramData {
    return analyseCQTFromAudioBuffer(this.audioBuffer);
  }
}

export default OfflineAnalyser;
