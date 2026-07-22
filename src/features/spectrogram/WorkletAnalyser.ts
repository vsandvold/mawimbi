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
import { computeKernel } from './CQTAnalyser';
import {
  type SerializedCQTKernel,
  getTransferables,
  serializeKernel,
} from './LiveCQTAnalyser';

const PROCESSOR_NAME = 'analysis-processor';
const DEFAULT_SMOOTHING = 0.8;
const POWER_CURVE_EXPONENT = 0.6;

// The CQT kernel depends only on sample rate, which is constant for a
// session — computing it (~225 bins, ~1M trig calls) and serializing it
// (~4MB) is too expensive to repeat on every enableCQTAnalysis() call
// (every playback start, since useScrubberScroll disposes/recreates its
// FrequencyVisualizer on every play/pause toggle). Cached at module scope
// so every WorkletAnalyser instance shares it (mixer and mic analysers
// typically share one AudioContext's sample rate).
const serializedKernelCache = new Map<number, SerializedCQTKernel>();

function getCachedSerializedKernel(sampleRate: number): SerializedCQTKernel {
  let kernel = serializedKernelCache.get(sampleRate);
  if (!kernel) {
    kernel = serializeKernel(computeKernel(sampleRate));
    serializedKernelCache.set(sampleRate, kernel);
  }
  return kernel;
}

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
   *
   * Single-consumer today: enable/disableCQTAnalysis have no consumer
   * tracking — whichever caller calls disableCQTAnalysis() last turns CQT
   * off for every holder of this instance. Only `useScrubberScroll`'s
   * playback visualizer uses the destination-tapped instance for CQT right
   * now; a second concurrent consumer (e.g. OnsetDetector #485, spec 005's
   * live pitch) sharing it via TrackService.getWorkletAnalyser() would need
   * refcounting added here first.
   */
  enableCQTAnalysis(sampleRate: number): void {
    const serialized = getCachedSerializedKernel(sampleRate);
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

    // `serialized` is the shared cache entry (getCachedSerializedKernel) —
    // clone its buffers before handing them to postMessage's transfer list.
    // A Transferable transfer detaches the underlying ArrayBuffers from the
    // sender; transferring the cached arrays directly would leave the cache
    // entry's arrays zero-length for every subsequent caller.
    const cosBuffer = serialized.cosBuffer.slice();
    const sinBuffer = serialized.sinBuffer.slice();
    const binLengths = serialized.binLengths.slice();
    const transferables = getTransferables({
      ...serialized,
      cosBuffer,
      sinBuffer,
      binLengths,
    });

    this.node.port.postMessage(
      {
        type: 'configure',
        cqtAnalysis: true,
        cqtKernel: {
          cosBuffer,
          sinBuffer,
          binLengths,
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
