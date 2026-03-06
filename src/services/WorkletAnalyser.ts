// WorkletAnalyser — main-thread wrapper for the AnalysisProcessor
// AudioWorklet.
//
// Drop-in replacement for Tone.Meter that runs RMS loudness calculation
// on the audio thread instead of the main thread. Eliminates
// AnalyserNode's main-thread contention during complex playback with
// many tracks.
//
// Provides two optional frequency-domain analysis modes:
//
// 1. **FFT mode** — Cooley-Tukey radix-2 FFT on the audio thread.
//    Enable with enableFrequencyAnalysis(). Returns linear-frequency bins.
//
// 2. **CQT mode** — Constant-Q Transform on the audio thread using
//    pre-computed kernels. Enable with enableCQTAnalysis(). Returns
//    log-frequency bins identical to the offline CQT spectrogram.

import {
  type AnalysisCommand,
  type AnalysisMessage,
} from './AnalysisProcessor';
import LiveCQTAnalyser, {
  type SerializedCQTKernel,
  getTransferables,
} from './LiveCQTAnalyser';

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

  // FFT frequency analysis state
  private _fftSize: number;
  private _minDecibels: number;
  private _maxDecibels: number;
  private currentBins: Uint8Array | null = null;

  // CQT analysis state
  private _cqtBinCount = 0;
  private currentCQTBins: Uint8Array | null = null;

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
   * Number of CQT bins. Only meaningful after enableCQTAnalysis()
   * has been called.
   */
  get cqtBinCount(): number {
    return this._cqtBinCount;
  }

  // --- FFT frequency analysis ---

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

  // --- CQT analysis ---

  /**
   * Enables CQT analysis on the audio thread.
   *
   * Computes the CQT kernel for the given sample rate and transfers
   * it to the AudioWorklet processor. The processor runs the CQT at
   * the hop interval (25ms) and posts back CQT frames.
   */
  enableCQTAnalysis(sampleRate: number): void {
    const liveCQT = new LiveCQTAnalyser(sampleRate);
    const serialized = liveCQT.getSerializedKernel();
    this._cqtBinCount = serialized.numberBins;
    this.currentCQTBins = new Uint8Array(serialized.numberBins);

    this.sendCQTConfig(serialized);
  }

  /**
   * Disables CQT analysis on the audio thread.
   */
  disableCQTAnalysis(): void {
    this.currentCQTBins = null;
    this._cqtBinCount = 0;

    if (this.node) {
      this.node.port.postMessage({
        type: 'configure',
        cqtAnalysis: false,
      } satisfies AnalysisCommand);
    }
  }

  /**
   * Copies the latest CQT data into the provided output array.
   * Returns false if CQT analysis is not enabled or no data available.
   */
  getCQTData(output: Uint8Array): boolean {
    if (!this.currentCQTBins) return false;
    output.set(this.currentCQTBins.subarray(0, output.length));
    return true;
  }

  dispose(): void {
    this.node?.disconnect();
    this.node = null;
    this.currentRms = 0;
    this.currentBins = null;
    this.currentCQTBins = null;
    this._cqtBinCount = 0;
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

  private sendCQTConfig(serialized: SerializedCQTKernel): void {
    if (!this.node) return;

    const transferables = getTransferables(serialized);

    this.node.port.postMessage(
      {
        type: 'configure',
        cqtAnalysis: true,
        cqtKernel: {
          cosBuffer: serialized.cosBuffer,
          sinBuffer: serialized.sinBuffer,
          binLengths: serialized.binLengths,
          numberBins: serialized.numberBins,
          hopSize: serialized.hopSize,
        },
      } satisfies AnalysisCommand,
      transferables,
    );
  }

  private setupMessageHandler(node: AudioWorkletNode): void {
    node.port.onmessage = (event: MessageEvent<AnalysisMessage>) => {
      if (event.data.type === 'loudness') {
        this.currentRms = event.data.rms;
      } else if (event.data.type === 'frequencyData' && this.currentBins) {
        this.currentBins.set(
          event.data.bins.subarray(0, this.currentBins.length),
        );
      } else if (event.data.type === 'cqtData' && this.currentCQTBins) {
        this.currentCQTBins.set(
          event.data.bins.subarray(0, this.currentCQTBins.length),
        );
      }
    };
  }
}

export default WorkletAnalyser;
