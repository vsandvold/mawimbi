import { analyseCQTFromAudioBuffer } from './CQTAnalyser';

export type SpectrogramData = {
  frequencyFrames: Uint8Array[];
  timeResolution: number;
  frequencyBinCount: number;
  sampleRate: number;
  duration: number;
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
