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

  // Frequency analysis state
  private _fftSize: number;
  private _minDecibels: number;
  private _maxDecibels: number;
  private currentBins: Uint8Array | null = null;

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

    this.currentBins = new Uint8Array(this._fftSize / 2);

    this.sendFrequencyConfig();
  }

  /**
   * Disables frequency-domain analysis. The processor stops computing
   * FFT, freeing audio-thread resources.
   */
  disableFrequencyAnalysis(): void {
    this.currentBins = null;

    if (this.node) {
      this.node.port.postMessage({
        type: 'configure',
        frequencyAnalysis: false,
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

  dispose(): void {
    this.node?.disconnect();
    this.node = null;
    this.currentRms = 0;
    this.currentBins = null;
  }

  private sendFrequencyConfig(): void {
    if (!this.node) return;

    this.node.port.postMessage({
      type: 'configure',
      frequencyAnalysis: true,
      fftSize: this._fftSize,
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
      }
    };
  }
}

export default WorkletAnalyser;
