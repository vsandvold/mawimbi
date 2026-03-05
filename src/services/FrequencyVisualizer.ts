/**
 * Live frequency visualization service.
 *
 * Four analysis paths, selected by constructor options:
 *
 * 1. **WorkletAnalyser + multi-band** — splits the signal via biquad
 *    filters into four bands, routes each band into its own WorkletAnalyser
 *    with an FFT size matching the offline pipeline's resolution per band.
 *    Best resolution consistency with no main-thread FFT cost.
 *    Selected when both `workletAnalyser` and `dualBand` are set.
 *
 * 2. **WorkletAnalyser** — single FFT on the audio thread via
 *    AudioWorkletProcessor, with log-frequency mapping on the main
 *    thread. Selected when `workletAnalyser` is provided without `dualBand`.
 *
 * 3. **Multi-band AnalyserNode** — splits the signal via biquad filters
 *    into four bands, runs separate native AnalyserNode FFTs for each
 *    band on the main thread, merges them, and applies a multi-band
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
import {
  BAND_CONFIGS,
  type BandMergeInfo,
  calculateLiveMergeParams,
  LIVE_BAND_FFT_SIZES,
} from './dualBandAnalysis';
import {
  applyLogFrequencyMapping,
  createLogFrequencyMapping,
  createMultiBandLogMapping,
} from './logFrequencyMapping';
import WorkletAnalyser from './WorkletAnalyser';

const SMOOTHING = 0;
const MIN_DECIBELS = -80;
const MAX_DECIBELS = -30;

// Worklet path FFT size. 2048 gives ~21.5 Hz/bin at 44.1 kHz — moderate
// resolution suitable for real-time visualization. The multi-band approach
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

  // Worklet multi-band path state (N internal WorkletAnalysers)
  private workletMultiBand = false;
  private workletBandAnalysers: WorkletAnalyser[] = [];

  // Single-analyser path state
  private singleAnalyser: AnalyserNode | null = null;
  private singleData: Uint8Array<ArrayBuffer> | null = null;
  private singleOutput: Uint8Array<ArrayBuffer> | null = null;
  private singleLogMapping: number[][] | null = null;

  // Multi-band shared state (native and worklet multi-band paths)
  private bandFilters: BiquadFilterNode[] = [];
  private bandData: Uint8Array<ArrayBuffer>[] = [];
  private mergedData: Uint8Array<ArrayBuffer> | null = null;
  private outputData: Uint8Array<ArrayBuffer> | null = null;
  private logMapping: number[][] | null = null;
  private bandMergeInfos: BandMergeInfo[] = [];

  // Native multi-band specific state
  private bandAnalysers: AnalyserNode[] = [];
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

    const toneCtx = source.context ?? Tone.context;
    const sampleRate = (toneCtx.rawContext as AudioContext).sampleRate;

    if (opts.workletAnalyser && opts.dualBand) {
      this.initializeWorkletMultiBandPath(source, outputBinCount);
    } else if (opts.workletAnalyser) {
      this.workletAnalyser = opts.workletAnalyser;
      this.initializeWorkletPath(
        opts.workletAnalyser,
        outputBinCount,
        sampleRate,
      );
    } else if (opts.dualBand) {
      this.initializeMultiBandPath(source, outputBinCount);
    } else {
      this.initializeSingleAnalyserPath(source, outputBinCount);
    }
  }

  getVisualizationData(): Uint8Array {
    if (this.workletMultiBand) {
      return this.getWorkletMultiBandVisualizationData();
    }
    if (this.workletAnalyser && this.workletData && this.workletOutput) {
      return this.getWorkletVisualizationData();
    }
    if (this.singleAnalyser && this.singleData && this.singleOutput) {
      return this.getSingleAnalyserVisualizationData();
    }
    return this.getMultiBandVisualizationData();
  }

  dispose(): void {
    if (this.workletMultiBand) {
      for (const analyser of this.workletBandAnalysers) {
        analyser.disableFrequencyAnalysis();
        analyser.dispose();
      }
      this.workletBandAnalysers = [];
      this.workletMultiBand = false;
      for (const filter of this.bandFilters) {
        filter.disconnect();
      }
      this.bandFilters = [];
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

    for (const filter of this.bandFilters) {
      filter.disconnect();
    }
    for (const analyser of this.bandAnalysers) {
      analyser.disconnect();
    }
    this.muter?.disconnect();
    this.bandFilters = [];
    this.bandAnalysers = [];
  }

  // --- Worklet path (single-band) ---

  private initializeWorkletPath(
    analyser: WorkletAnalyser,
    outputBinCount: number,
    sampleRate: number,
  ): void {
    analyser.enableFrequencyAnalysis({
      fftSize: WORKLET_FFT_SIZE,
      minDecibels: MIN_DECIBELS,
      maxDecibels: MAX_DECIBELS,
    });

    const inputBinCount = analyser.frequencyBinCount;
    const binWidth = sampleRate / WORKLET_FFT_SIZE;
    this.workletData = new Uint8Array(inputBinCount);
    this.workletOutput = new Uint8Array(outputBinCount);
    this.workletLogMapping = createLogFrequencyMapping(
      inputBinCount,
      outputBinCount,
      binWidth,
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

  // --- Worklet path (multi-band) ---
  //
  // Creates N internal WorkletAnalysers, each receiving one side of a
  // biquad frequency split. The provided workletAnalyser (from the
  // constructor options) acts as a capability signal — its existence tells
  // us the AudioWorklet module is already registered, so we can safely
  // create new instances on the same native context.

  private initializeWorkletMultiBandPath(
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

    // Create WorkletAnalysers and biquad filter chains for each band
    for (let i = 0; i < BAND_CONFIGS.length; i++) {
      const config = BAND_CONFIGS[i];

      // Build filter chain for this band
      const filterChain: BiquadFilterNode[] = [];
      if (config.lowerFreq > 0) {
        const hp = nativeCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = config.lowerFreq;
        filterChain.push(hp);
      }
      if (config.upperFreq > 0) {
        const lp = nativeCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = config.upperFreq;
        filterChain.push(lp);
      }

      const wa = new WorkletAnalyser(nativeCtx, 0);

      // Wire: source → filter[0] → ... → filter[N-1] → wa.input
      // Access wa.input first to create the underlying AudioWorkletNode,
      // so that enableFrequencyAnalysis can post its config message.
      if (filterChain.length === 0) {
        source.connect(wa.input as unknown as AudioNode);
      } else {
        source.connect(filterChain[0] as unknown as AudioNode);
        for (let j = 1; j < filterChain.length; j++) {
          filterChain[j - 1].connect(filterChain[j]);
        }
        filterChain[filterChain.length - 1].connect(wa.input);
      }

      wa.enableFrequencyAnalysis({
        fftSize: LIVE_BAND_FFT_SIZES[i],
        minDecibels: MIN_DECIBELS,
        maxDecibels: MAX_DECIBELS,
      });

      this.bandFilters.push(...filterChain);
      this.workletBandAnalysers.push(wa);
    }

    this.workletMultiBand = true;

    // Merge parameters
    const params = calculateLiveMergeParams(sampleRate);
    this.bandMergeInfos = params.bands;

    this.logMapping = createMultiBandLogMapping(params, outputBinCount);

    this.bandData = this.workletBandAnalysers.map(
      (wa) => new Uint8Array(wa.frequencyBinCount),
    );
    this.mergedData = new Uint8Array(params.mergedBinCount);
    this.outputData = new Uint8Array(outputBinCount);
  }

  private getWorkletMultiBandVisualizationData(): Uint8Array {
    for (let i = 0; i < this.workletBandAnalysers.length; i++) {
      this.workletBandAnalysers[i].getByteFrequencyData(this.bandData[i]);
    }

    let offset = 0;
    for (let b = 0; b < this.bandMergeInfos.length; b++) {
      const band = this.bandMergeInfos[b];
      for (let i = 0; i < band.binCount; i++) {
        this.mergedData![offset + i] = this.bandData[b][band.startBin + i];
      }
      offset += band.binCount;
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
    const binWidth = ctx.sampleRate / SINGLE_FFT_SIZE;
    this.singleData = new Uint8Array(inputBinCount);
    this.singleOutput = new Uint8Array(outputBinCount);
    this.singleLogMapping = createLogFrequencyMapping(
      inputBinCount,
      outputBinCount,
      binWidth,
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

  // --- Multi-band fallback (native AnalyserNodes) ---

  private initializeMultiBandPath(
    source: Tone.ToneAudioNode,
    outputBinCount: number,
  ): void {
    const toneCtx = source.context ?? Tone.context;
    const ctx = toneCtx.rawContext as AudioContext;
    const sampleRate = ctx.sampleRate;

    // Keep analysers in the rendering graph without audible output.
    this.muter = ctx.createGain();
    this.muter.gain.value = 0;
    this.muter.connect(ctx.destination);

    for (let i = 0; i < BAND_CONFIGS.length; i++) {
      const config = BAND_CONFIGS[i];
      const fftSize = LIVE_BAND_FFT_SIZES[i];

      // Build filter chain for this band
      const filterChain: BiquadFilterNode[] = [];
      if (config.lowerFreq > 0) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = config.lowerFreq;
        filterChain.push(hp);
      }
      if (config.upperFreq > 0) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = config.upperFreq;
        filterChain.push(lp);
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = SMOOTHING;
      analyser.minDecibels = MIN_DECIBELS;
      analyser.maxDecibels = MAX_DECIBELS;

      // Wire: source → filter[0] → ... → filter[N-1] → analyser → muter
      if (filterChain.length === 0) {
        source.connect(analyser as unknown as AudioNode);
      } else {
        source.connect(filterChain[0] as unknown as AudioNode);
        for (let j = 1; j < filterChain.length; j++) {
          filterChain[j - 1].connect(filterChain[j]);
        }
        filterChain[filterChain.length - 1].connect(analyser);
      }
      analyser.connect(this.muter);

      this.bandFilters.push(...filterChain);
      this.bandAnalysers.push(analyser);
    }

    // Merge parameters
    const params = calculateLiveMergeParams(sampleRate);
    this.bandMergeInfos = params.bands;

    this.logMapping = createMultiBandLogMapping(params, outputBinCount);

    this.bandData = this.bandAnalysers.map(
      (a) => new Uint8Array(a.frequencyBinCount),
    );
    this.mergedData = new Uint8Array(params.mergedBinCount);
    this.outputData = new Uint8Array(outputBinCount);
  }

  private getMultiBandVisualizationData(): Uint8Array {
    for (let i = 0; i < this.bandAnalysers.length; i++) {
      this.bandAnalysers[i].getByteFrequencyData(this.bandData[i]);
    }

    let offset = 0;
    for (let b = 0; b < this.bandMergeInfos.length; b++) {
      const band = this.bandMergeInfos[b];
      for (let i = 0; i < band.binCount; i++) {
        this.mergedData![offset + i] = this.bandData[b][band.startBin + i];
      }
      offset += band.binCount;
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
