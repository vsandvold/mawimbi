// WorkletAnalyser — main-thread wrapper for the AnalysisProcessor
// AudioWorklet.
//
// Drop-in replacement for Tone.Meter that runs RMS loudness calculation
// on the audio thread instead of the main thread. Eliminates
// AnalyserNode's main-thread contention during complex playback with
// many tracks.
//
// Also provides CQT (Constant-Q Transform) frequency analysis on the
// audio thread using pre-computed kernels. Enable with
// enableCQTAnalysis(). Returns log-frequency bins identical to the
// offline CQT spectrogram.

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

class WorkletAnalyser {
  private audioContext: AudioContext;
  private node: AudioWorkletNode | null = null;
  private currentRms = 0;
  private smoothing: number;
  private initialized = false;

  // CQT analysis state
  private _cqtBinCount = 0;
  private currentCQTBins: Uint8Array | null = null;

  constructor(audioContext: AudioContext, smoothing = DEFAULT_SMOOTHING) {
    this.audioContext = audioContext;
    this.smoothing = smoothing;
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
   * Number of CQT bins. Only meaningful after enableCQTAnalysis()
   * has been called.
   */
  get cqtBinCount(): number {
    return this._cqtBinCount;
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
    this.currentCQTBins = null;
    this._cqtBinCount = 0;
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
      } else if (event.data.type === 'cqtData' && this.currentCQTBins) {
        this.currentCQTBins.set(
          event.data.bins.subarray(0, this.currentCQTBins.length),
        );
      }
    };
  }
}

export default WorkletAnalyser;
