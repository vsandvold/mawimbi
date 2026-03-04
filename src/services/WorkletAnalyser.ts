// WorkletAnalyser — main-thread wrapper for the AnalysisProcessor
// AudioWorklet.
//
// Drop-in replacement for Tone.Meter that runs RMS loudness calculation
// on the audio thread instead of the main thread. Eliminates
// AnalyserNode's main-thread contention during complex playback with
// many tracks.
//
// Optionally provides frequency-domain analysis (FFT on the audio
// thread), replacing AnalyserNode.getByteFrequencyData(). Enable with
// enableFrequencyAnalysis() after initialization.
//
// Dual-band mode runs two independent FFTs (large for low band, small
// for high band) on the audio thread and posts results separately.
// Enable with enableDualBandFrequencyAnalysis().

import {
  type AnalysisCommand,
  type AnalysisMessage,
} from './AnalysisProcessor';

const PROCESSOR_NAME = 'analysis-processor';
const DEFAULT_SMOOTHING = 0.8;
const POWER_CURVE_EXPONENT = 0.6;
const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_MIN_DECIBELS = -100;
const DEFAULT_MAX_DECIBELS = -30;

class WorkletAnalyser {
  private audioContext: AudioContext;
  private node: AudioWorkletNode | null = null;
  private currentRms = 0;
  private smoothing: number;
  private initialized = false;

  // Single-band frequency analysis state
  private _fftSize: number;
  private _minDecibels: number;
  private _maxDecibels: number;
  private currentBins: Uint8Array | null = null;

  // Dual-band frequency analysis state
  private _dualBandEnabled = false;
  private _lowFftSize = 0;
  private _highFftSize = 0;
  private currentLowBins: Uint8Array | null = null;
  private currentHighBins: Uint8Array | null = null;

  constructor(audioContext: AudioContext, smoothing = DEFAULT_SMOOTHING) {
    this.audioContext = audioContext;
    this.smoothing = smoothing;
    this._fftSize = DEFAULT_FFT_SIZE;
    this._minDecibels = DEFAULT_MIN_DECIBELS;
    this._maxDecibels = DEFAULT_MAX_DECIBELS;
  }

  // Load the worklet module. Must be called once before connecting sources.
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const moduleUrl = new URL('./AnalysisProcessor.ts', import.meta.url);
    await this.audioContext.audioWorklet.addModule(moduleUrl);
    this.initialized = true;
  }

  // Returns the AudioWorkletNode so the caller can connect audio sources
  // to it (e.g., destination → analyser node).
  get input(): AudioNode {
    if (!this.node) {
      this.node = new AudioWorkletNode(this.audioContext, PROCESSOR_NAME);
      this.setupMessageHandler(this.node);

      // Send initial smoothing configuration
      this.node.port.postMessage({
        type: 'configure',
        smoothing: this.smoothing,
      } satisfies AnalysisCommand);
    }
    return this.node;
  }

  // Returns the current loudness value (0–1) with the same power curve
  // used by MixerService for perceptual scaling.
  getLoudness(): number {
    return Math.pow(Math.max(0, this.currentRms), POWER_CURVE_EXPONENT);
  }

  // Returns the raw RMS value without the perceptual power curve.
  getRawRms(): number {
    return Math.max(0, this.currentRms);
  }

  /**
   * Number of frequency bins (fftSize / 2). Only meaningful after
   * enableFrequencyAnalysis() has been called.
   */
  get frequencyBinCount(): number {
    return this._fftSize / 2;
  }

  get fftSize(): number {
    return this._fftSize;
  }

  get minDecibels(): number {
    return this._minDecibels;
  }

  get maxDecibels(): number {
    return this._maxDecibels;
  }

  get sampleRate(): number {
    return this.audioContext.sampleRate;
  }

  // --- Dual-band getters ---

  get dualBandEnabled(): boolean {
    return this._dualBandEnabled;
  }

  get lowFftSize(): number {
    return this._lowFftSize;
  }

  get highFftSize(): number {
    return this._highFftSize;
  }

  get lowFrequencyBinCount(): number {
    return this._lowFftSize / 2;
  }

  get highFrequencyBinCount(): number {
    return this._highFftSize / 2;
  }

  /**
   * Enables frequency-domain analysis on the audio thread.
   *
   * Must be called after `initialize()` and after accessing `.input`
   * at least once (so the node exists). Sends a configure command to
   * the processor to start accumulating samples and running FFT.
   */
  enableFrequencyAnalysis(options?: {
    fftSize?: number;
    minDecibels?: number;
    maxDecibels?: number;
  }): void {
    if (options?.fftSize !== undefined) this._fftSize = options.fftSize;
    if (options?.minDecibels !== undefined)
      this._minDecibels = options.minDecibels;
    if (options?.maxDecibels !== undefined)
      this._maxDecibels = options.maxDecibels;

    this._dualBandEnabled = false;
    this.currentLowBins = null;
    this.currentHighBins = null;
    this.currentBins = new Uint8Array(this._fftSize / 2);

    this.sendFrequencyConfig();
  }

  /**
   * Enables dual-band frequency analysis on the audio thread.
   *
   * Runs two independent FFTs: a large one (lowFftSize) for fine
   * low-frequency resolution and a small one (highFftSize) for the
   * high band. Results are posted independently as
   * 'lowFrequencyData' and 'highFrequencyData' messages.
   */
  enableDualBandFrequencyAnalysis(options: {
    lowFftSize: number;
    highFftSize: number;
    minDecibels?: number;
    maxDecibels?: number;
  }): void {
    this._lowFftSize = options.lowFftSize;
    this._highFftSize = options.highFftSize;
    if (options.minDecibels !== undefined)
      this._minDecibels = options.minDecibels;
    if (options.maxDecibels !== undefined)
      this._maxDecibels = options.maxDecibels;

    this._dualBandEnabled = true;
    this.currentBins = null;
    this.currentLowBins = new Uint8Array(options.lowFftSize / 2);
    this.currentHighBins = new Uint8Array(options.highFftSize / 2);

    this.sendDualBandConfig();
  }

  /**
   * Disables frequency-domain analysis. The processor stops computing
   * FFT, freeing audio-thread resources.
   */
  disableFrequencyAnalysis(): void {
    this.currentBins = null;
    this.currentLowBins = null;
    this.currentHighBins = null;
    this._dualBandEnabled = false;

    if (this.node) {
      this.node.port.postMessage({
        type: 'configure',
        frequencyAnalysis: false,
        dualBand: false,
      } satisfies AnalysisCommand);
    }
  }

  /**
   * Copies the latest frequency magnitude data into the provided array.
   *
   * Follows the same convention as `AnalyserNode.getByteFrequencyData()`:
   * values are 0–255 representing dB magnitude scaled between
   * `minDecibels` and `maxDecibels`.
   *
   * Returns false if frequency analysis is not enabled or no data is
   * available yet.
   */
  getByteFrequencyData(output: Uint8Array): boolean {
    if (!this.currentBins) return false;
    output.set(this.currentBins.subarray(0, output.length));
    return true;
  }

  /**
   * Copies the latest dual-band frequency data into the provided arrays.
   *
   * Returns false if dual-band analysis is not enabled.
   */
  getDualBandFrequencyData(
    lowOutput: Uint8Array,
    highOutput: Uint8Array,
  ): boolean {
    if (!this.currentLowBins || !this.currentHighBins) return false;
    lowOutput.set(this.currentLowBins.subarray(0, lowOutput.length));
    highOutput.set(this.currentHighBins.subarray(0, highOutput.length));
    return true;
  }

  dispose(): void {
    this.node?.disconnect();
    this.node = null;
    this.currentRms = 0;
    this.currentBins = null;
    this.currentLowBins = null;
    this.currentHighBins = null;
    this._dualBandEnabled = false;
  }

  private sendFrequencyConfig(): void {
    if (!this.node) return;

    this.node.port.postMessage({
      type: 'configure',
      frequencyAnalysis: true,
      dualBand: false,
      fftSize: this._fftSize,
      minDecibels: this._minDecibels,
      maxDecibels: this._maxDecibels,
    } satisfies AnalysisCommand);
  }

  private sendDualBandConfig(): void {
    if (!this.node) return;

    this.node.port.postMessage({
      type: 'configure',
      dualBand: true,
      lowFftSize: this._lowFftSize,
      highFftSize: this._highFftSize,
      minDecibels: this._minDecibels,
      maxDecibels: this._maxDecibels,
    } satisfies AnalysisCommand);
  }

  private setupMessageHandler(node: AudioWorkletNode): void {
    node.port.onmessage = (event: MessageEvent<AnalysisMessage>) => {
      if (event.data.type === 'loudness') {
        this.currentRms = event.data.rms;
      } else if (event.data.type === 'frequencyData' && this.currentBins) {
        this.currentBins.set(
          event.data.bins.subarray(0, this.currentBins.length),
        );
      } else if (
        event.data.type === 'lowFrequencyData' &&
        this.currentLowBins
      ) {
        this.currentLowBins.set(
          event.data.bins.subarray(0, this.currentLowBins.length),
        );
      } else if (
        event.data.type === 'highFrequencyData' &&
        this.currentHighBins
      ) {
        this.currentHighBins.set(
          event.data.bins.subarray(0, this.currentHighBins.length),
        );
      }
    };
  }
}

export default WorkletAnalyser;
