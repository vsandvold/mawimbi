/**
 * Live frequency visualization service.
 *
 * Four analysis paths, selected by constructor options:
 *
 * 1. **WorkletAnalyser + dual-band** — splits the signal via biquad
 *    filters, routes each band into its own WorkletAnalyser (large FFT
 *    for low, small FFT for high), merges and maps on the main thread.
 *    Best low-frequency resolution with no main-thread FFT cost.
 *    Selected when both `workletAnalyser` and `dualBand` are set.
 *
 * 2. **WorkletAnalyser** — single FFT on the audio thread via
 *    AudioWorkletProcessor, with log-frequency mapping on the main
 *    thread. Selected when `workletAnalyser` is provided without `dualBand`.
 *
 * 3. **Dual-band AnalyserNode** — splits the signal at ~752 Hz via biquad
 *    filters, runs separate native AnalyserNode FFTs for the low and high
 *    bands on the main thread, merges them, and applies a dual-band
 *    log-frequency mapping. Selected when `dualBand: true` without a worklet.
 *
 * 4. **Single AnalyserNode** (default fallback) — one AnalyserNode with a
 *    standard log-frequency mapping. Simplest path with lower CPU cost.
 *    Selected when no worklet is provided and `dualBand` is false.
 *
 * Consumers receive a ready-to-render Uint8Array (0–255) — no analysis
 * details leak outside this module.
 */
import * as Tone from 'tone';
import { SPLIT_FREQUENCY } from './dualBandAnalysis';
import {
  applyLogFrequencyMapping,
  createDualBandLogMapping,
  createLogFrequencyMapping,
} from './logFrequencyMapping';
import WorkletAnalyser from './WorkletAnalyser';

const SMOOTHING = 0;
const MIN_DECIBELS = -80;
const MAX_DECIBELS = -30;

// Dual-band FFT sizes (shared by native and worklet dual-band paths).
// 16384-point FFT at native sample rate gives ~2.7 Hz/bin resolution,
// closely matching the offline pipeline's 2.5 Hz/bin (2048 FFT at 5120 Hz).
const LOW_FFT_SIZE = 16384;
const HIGH_FFT_SIZE = 1024;

// Worklet path FFT size. 2048 gives ~21.5 Hz/bin at 44.1 kHz — moderate
// resolution suitable for real-time visualization. The dual-band approach
// offers finer low-frequency resolution but requires native AnalyserNodes
// on the main thread.
const WORKLET_FFT_SIZE = 2048;

// Single-analyser FFT size. 2048 matches the worklet path resolution.
const SINGLE_FFT_SIZE = 2048;

const DEFAULT_OUTPUT_BIN_COUNT = 512;

type FrequencyVisualizerOptions = {
  workletAnalyser?: WorkletAnalyser;
  frequencyBinCount?: number;
  dualBand?: boolean;
};

class FrequencyVisualizer {
  readonly frequencyBinCount: number;

  // Worklet path state (single-band)
  private workletAnalyser: WorkletAnalyser | null = null;
  private workletData: Uint8Array<ArrayBuffer> | null = null;
  private workletOutput: Uint8Array<ArrayBuffer> | null = null;
  private workletLogMapping: number[][] | null = null;

  // Worklet dual-band path state (two internal WorkletAnalysers)
  private workletDualBand = false;
  private workletLowAnalyser: WorkletAnalyser | null = null;
  private workletHighAnalyser: WorkletAnalyser | null = null;

  // Single-analyser path state
  private singleAnalyser: AnalyserNode | null = null;
  private singleData: Uint8Array<ArrayBuffer> | null = null;
  private singleOutput: Uint8Array<ArrayBuffer> | null = null;
  private singleLogMapping: number[][] | null = null;

  // Dual-band shared state (native and worklet dual-band paths)
  private lowFilter: BiquadFilterNode | null = null;
  private highFilter: BiquadFilterNode | null = null;
  private lowData: Uint8Array<ArrayBuffer> | null = null;
  private highData: Uint8Array<ArrayBuffer> | null = null;
  private mergedData: Uint8Array<ArrayBuffer> | null = null;
  private outputData: Uint8Array<ArrayBuffer> | null = null;
  private logMapping: number[][] | null = null;
  private lowBinCount = 0;
  private highBinStart = 0;
  private highBinEnd = 0;

  // Native dual-band specific state
  private lowAnalyser: AnalyserNode | null = null;
  private highAnalyser: AnalyserNode | null = null;
  private muter: GainNode | null = null;

  constructor(source: Tone.ToneAudioNode, options?: FrequencyVisualizerOptions);
  /** @deprecated Use options object instead. */
  constructor(source: Tone.ToneAudioNode, workletAnalyser?: WorkletAnalyser);
  constructor(
    source: Tone.ToneAudioNode,
    optionsOrAnalyser?: FrequencyVisualizerOptions | WorkletAnalyser,
  ) {
    const opts = normalizeOptions(optionsOrAnalyser);
    const outputBinCount = opts.frequencyBinCount ?? DEFAULT_OUTPUT_BIN_COUNT;
    this.frequencyBinCount = outputBinCount;

    if (opts.workletAnalyser && opts.dualBand) {
      this.initializeWorkletDualBandPath(source, outputBinCount);
    } else if (opts.workletAnalyser) {
      this.workletAnalyser = opts.workletAnalyser;
      this.initializeWorkletPath(opts.workletAnalyser, outputBinCount);
    } else if (opts.dualBand) {
      this.initializeDualBandPath(source, outputBinCount);
    } else {
      this.initializeSingleAnalyserPath(source, outputBinCount);
    }
  }

  getVisualizationData(): Uint8Array {
    if (this.workletDualBand) {
      return this.getWorkletDualBandVisualizationData();
    }
    if (this.workletAnalyser && this.workletData && this.workletOutput) {
      return this.getWorkletVisualizationData();
    }
    if (this.singleAnalyser && this.singleData && this.singleOutput) {
      return this.getSingleAnalyserVisualizationData();
    }
    return this.getDualBandVisualizationData();
  }

  dispose(): void {
    if (this.workletDualBand) {
      this.workletLowAnalyser?.disableFrequencyAnalysis();
      this.workletLowAnalyser?.dispose();
      this.workletHighAnalyser?.disableFrequencyAnalysis();
      this.workletHighAnalyser?.dispose();
      this.workletLowAnalyser = null;
      this.workletHighAnalyser = null;
      this.workletDualBand = false;
      this.lowFilter?.disconnect();
      this.highFilter?.disconnect();
      return;
    }

    if (this.workletAnalyser) {
      this.workletAnalyser.disableFrequencyAnalysis();
      this.workletAnalyser = null;
      this.workletData = null;
      this.workletOutput = null;
      this.workletLogMapping = null;
      return;
    }

    if (this.singleAnalyser) {
      this.singleAnalyser.disconnect();
      this.singleAnalyser = null;
      this.singleData = null;
      this.singleOutput = null;
      this.singleLogMapping = null;
      return;
    }

    this.lowFilter?.disconnect();
    this.highFilter?.disconnect();
    this.lowAnalyser?.disconnect();
    this.highAnalyser?.disconnect();
    this.muter?.disconnect();
  }

  // --- Worklet path (single-band) ---

  private initializeWorkletPath(
    analyser: WorkletAnalyser,
    outputBinCount: number,
  ): void {
    analyser.enableFrequencyAnalysis({
      fftSize: WORKLET_FFT_SIZE,
      minDecibels: MIN_DECIBELS,
      maxDecibels: MAX_DECIBELS,
    });

    const inputBinCount = analyser.frequencyBinCount;
    this.workletData = new Uint8Array(inputBinCount);
    this.workletOutput = new Uint8Array(outputBinCount);
    this.workletLogMapping = createLogFrequencyMapping(
      inputBinCount,
      outputBinCount,
    );
  }

  private getWorkletVisualizationData(): Uint8Array {
    this.workletAnalyser!.getByteFrequencyData(this.workletData!);
    applyLogFrequencyMapping(
      this.workletData!,
      this.workletLogMapping!,
      this.workletOutput!,
    );
    return this.workletOutput!;
  }

  // --- Worklet path (dual-band) ---
  //
  // Creates two internal WorkletAnalysers, each receiving one side of a
  // biquad frequency split. The provided workletAnalyser (from the
  // constructor options) acts as a capability signal — its existence tells
  // us the AudioWorklet module is already registered, so we can safely
  // create new instances on the same native context.

  private initializeWorkletDualBandPath(
    source: Tone.ToneAudioNode,
    outputBinCount: number,
  ): void {
    const toneCtx = source.context ?? Tone.context;
    const rawCtx = toneCtx.rawContext as AudioContext;
    // Extract the actual native context, bypassing the
    // standardized-audio-context wrapper (see CLAUDE.md).
    const nativeCtx =
      (rawCtx as unknown as { _nativeContext?: AudioContext })._nativeContext ??
      rawCtx;
    const sampleRate = nativeCtx.sampleRate;

    // Biquad filters on the native context
    this.lowFilter = nativeCtx.createBiquadFilter();
    this.lowFilter.type = 'lowpass';
    this.lowFilter.frequency.value = SPLIT_FREQUENCY;

    this.highFilter = nativeCtx.createBiquadFilter();
    this.highFilter.type = 'highpass';
    this.highFilter.frequency.value = SPLIT_FREQUENCY;

    // Two WorkletAnalysers on the native context. The worklet module is
    // already registered by AudioService, so we skip initialize() and
    // go straight to enabling frequency analysis.
    this.workletLowAnalyser = new WorkletAnalyser(nativeCtx, 0);
    this.workletHighAnalyser = new WorkletAnalyser(nativeCtx, 0);

    // Wire: source → filter → workletAnalyser.input
    source.connect(this.lowFilter as unknown as AudioNode);
    this.lowFilter.connect(this.workletLowAnalyser.input);

    source.connect(this.highFilter as unknown as AudioNode);
    this.highFilter.connect(this.workletHighAnalyser.input);

    this.workletLowAnalyser.enableFrequencyAnalysis({
      fftSize: LOW_FFT_SIZE,
      minDecibels: MIN_DECIBELS,
      maxDecibels: MAX_DECIBELS,
    });
    this.workletHighAnalyser.enableFrequencyAnalysis({
      fftSize: HIGH_FFT_SIZE,
      minDecibels: MIN_DECIBELS,
      maxDecibels: MAX_DECIBELS,
    });

    this.workletDualBand = true;

    // Merge parameters (identical to native dual-band)
    const lowBinWidth = sampleRate / LOW_FFT_SIZE;
    const highBinWidth = sampleRate / HIGH_FFT_SIZE;
    this.lowBinCount = Math.ceil(SPLIT_FREQUENCY / lowBinWidth);
    this.highBinStart = Math.ceil(SPLIT_FREQUENCY / highBinWidth);
    this.highBinEnd = HIGH_FFT_SIZE / 2;
    const mergedBinCount =
      this.lowBinCount + (this.highBinEnd - this.highBinStart);

    this.logMapping = createDualBandLogMapping(
      mergedBinCount,
      this.lowBinCount,
      lowBinWidth,
      this.highBinStart,
      highBinWidth,
      outputBinCount,
    );

    this.lowData = new Uint8Array(this.workletLowAnalyser.frequencyBinCount);
    this.highData = new Uint8Array(this.workletHighAnalyser.frequencyBinCount);
    this.mergedData = new Uint8Array(mergedBinCount);
    this.outputData = new Uint8Array(outputBinCount);
  }

  private getWorkletDualBandVisualizationData(): Uint8Array {
    this.workletLowAnalyser!.getByteFrequencyData(this.lowData!);
    this.workletHighAnalyser!.getByteFrequencyData(this.highData!);

    for (let i = 0; i < this.lowBinCount; i++) {
      this.mergedData![i] = this.lowData![i];
    }
    for (let i = this.highBinStart; i < this.highBinEnd; i++) {
      this.mergedData![this.lowBinCount + i - this.highBinStart] =
        this.highData![i];
    }

    applyLogFrequencyMapping(
      this.mergedData!,
      this.logMapping!,
      this.outputData!,
    );

    return this.outputData!;
  }

  // --- Single-analyser path ---

  private initializeSingleAnalyserPath(
    source: Tone.ToneAudioNode,
    outputBinCount: number,
  ): void {
    const toneCtx = source.context ?? Tone.context;
    const ctx = toneCtx.rawContext as AudioContext;

    this.singleAnalyser = ctx.createAnalyser();
    this.singleAnalyser.fftSize = SINGLE_FFT_SIZE;
    this.singleAnalyser.smoothingTimeConstant = SMOOTHING;
    this.singleAnalyser.minDecibels = MIN_DECIBELS;
    this.singleAnalyser.maxDecibels = MAX_DECIBELS;

    source.connect(this.singleAnalyser as unknown as AudioNode);

    const inputBinCount = this.singleAnalyser.frequencyBinCount;
    this.singleData = new Uint8Array(inputBinCount);
    this.singleOutput = new Uint8Array(outputBinCount);
    this.singleLogMapping = createLogFrequencyMapping(
      inputBinCount,
      outputBinCount,
    );
  }

  private getSingleAnalyserVisualizationData(): Uint8Array {
    this.singleAnalyser!.getByteFrequencyData(this.singleData!);
    applyLogFrequencyMapping(
      this.singleData!,
      this.singleLogMapping!,
      this.singleOutput!,
    );
    return this.singleOutput!;
  }

  // --- Dual-band fallback (native AnalyserNodes) ---

  private initializeDualBandPath(
    source: Tone.ToneAudioNode,
    outputBinCount: number,
  ): void {
    const toneCtx = source.context ?? Tone.context;
    const ctx = toneCtx.rawContext as AudioContext;
    const sampleRate = ctx.sampleRate;

    this.lowFilter = ctx.createBiquadFilter();
    this.lowFilter.type = 'lowpass';
    this.lowFilter.frequency.value = SPLIT_FREQUENCY;

    this.highFilter = ctx.createBiquadFilter();
    this.highFilter.type = 'highpass';
    this.highFilter.frequency.value = SPLIT_FREQUENCY;

    this.lowAnalyser = ctx.createAnalyser();
    this.lowAnalyser.fftSize = LOW_FFT_SIZE;
    this.lowAnalyser.smoothingTimeConstant = SMOOTHING;
    this.lowAnalyser.minDecibels = MIN_DECIBELS;
    this.lowAnalyser.maxDecibels = MAX_DECIBELS;

    this.highAnalyser = ctx.createAnalyser();
    this.highAnalyser.fftSize = HIGH_FFT_SIZE;
    this.highAnalyser.smoothingTimeConstant = SMOOTHING;
    this.highAnalyser.minDecibels = MIN_DECIBELS;
    this.highAnalyser.maxDecibels = MAX_DECIBELS;

    // Keep analysers in the rendering graph without audible output.
    this.muter = ctx.createGain();
    this.muter.gain.value = 0;
    this.muter.connect(ctx.destination);

    // Side-chain: source → filter → analyser → muter → destination (silent)
    source.connect(this.lowFilter as unknown as AudioNode);
    this.lowFilter.connect(this.lowAnalyser);
    this.lowAnalyser.connect(this.muter);

    source.connect(this.highFilter as unknown as AudioNode);
    this.highFilter.connect(this.highAnalyser);
    this.highAnalyser.connect(this.muter);

    // Merge parameters
    const lowBinWidth = sampleRate / LOW_FFT_SIZE;
    const highBinWidth = sampleRate / HIGH_FFT_SIZE;
    this.lowBinCount = Math.ceil(SPLIT_FREQUENCY / lowBinWidth);
    this.highBinStart = Math.ceil(SPLIT_FREQUENCY / highBinWidth);
    this.highBinEnd = HIGH_FFT_SIZE / 2;
    const mergedBinCount =
      this.lowBinCount + (this.highBinEnd - this.highBinStart);

    this.logMapping = createDualBandLogMapping(
      mergedBinCount,
      this.lowBinCount,
      lowBinWidth,
      this.highBinStart,
      highBinWidth,
      outputBinCount,
    );

    this.lowData = new Uint8Array(this.lowAnalyser.frequencyBinCount);
    this.highData = new Uint8Array(this.highAnalyser.frequencyBinCount);
    this.mergedData = new Uint8Array(mergedBinCount);
    this.outputData = new Uint8Array(outputBinCount);
  }

  private getDualBandVisualizationData(): Uint8Array {
    this.lowAnalyser!.getByteFrequencyData(this.lowData!);
    this.highAnalyser!.getByteFrequencyData(this.highData!);

    for (let i = 0; i < this.lowBinCount; i++) {
      this.mergedData![i] = this.lowData![i];
    }
    for (let i = this.highBinStart; i < this.highBinEnd; i++) {
      this.mergedData![this.lowBinCount + i - this.highBinStart] =
        this.highData![i];
    }

    applyLogFrequencyMapping(
      this.mergedData!,
      this.logMapping!,
      this.outputData!,
    );

    return this.outputData!;
  }
}

function normalizeOptions(
  arg?: FrequencyVisualizerOptions | WorkletAnalyser,
): FrequencyVisualizerOptions {
  if (!arg) return {};
  // Detect WorkletAnalyser by duck-typing its characteristic method
  if ('enableFrequencyAnalysis' in arg) {
    return { workletAnalyser: arg as WorkletAnalyser };
  }
  return arg as FrequencyVisualizerOptions;
}

export default FrequencyVisualizer;
