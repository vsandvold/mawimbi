/**
 * Live frequency visualization service.
 *
 * Unified CQT-based analysis — produces the same log-frequency output
 * as the offline CQT spectrogram. Two paths, selected by constructor
 * options:
 *
 * 1. **WorkletAnalyser CQT** (preferred) — CQT runs on the audio
 *    thread via AudioWorkletProcessor. No main-thread FFT cost.
 *    Selected when `workletAnalyser` is provided.
 *
 * 2. **Native AnalyserNode + main-thread CQT** (fallback) — reads
 *    time-domain samples from an AnalyserNode and runs the CQT on the
 *    main thread. Selected when no worklet is available.
 *
 * Output: Uint8Array with one byte per CQT bin (0–255), log-spaced
 * (24 bins/octave) from 32.7 Hz to Nyquist. Identical distribution
 * to the offline spectrogram — no log-frequency remapping needed.
 */
import * as Tone from 'tone';
import LiveCQTAnalyser, { computeNumberBins } from './LiveCQTAnalyser';
import WorkletAnalyser from './WorkletAnalyser';

type FrequencyVisualizerOptions = {
  workletAnalyser?: WorkletAnalyser;
};

class FrequencyVisualizer {
  readonly frequencyBinCount: number;

  // Worklet CQT path state
  private workletAnalyser: WorkletAnalyser | null = null;
  private workletCQTData: Uint8Array | null = null;

  // Native fallback path state
  private nativeAnalyser: AnalyserNode | null = null;
  private liveCQTAnalyser: LiveCQTAnalyser | null = null;
  private timeDomainBuffer: Float32Array<ArrayBuffer> | null = null;

  constructor(source: Tone.ToneAudioNode, options?: FrequencyVisualizerOptions);
  /** @deprecated Use options object instead. */
  constructor(source: Tone.ToneAudioNode, workletAnalyser?: WorkletAnalyser);
  constructor(
    source: Tone.ToneAudioNode,
    optionsOrAnalyser?: FrequencyVisualizerOptions | WorkletAnalyser,
  ) {
    const opts = normalizeOptions(optionsOrAnalyser);

    const toneCtx = source.context ?? Tone.context;
    const rawCtx = toneCtx.rawContext as AudioContext;
    const nativeCtx =
      (rawCtx as unknown as { _nativeContext?: AudioContext })._nativeContext ??
      rawCtx;
    const sampleRate = nativeCtx.sampleRate;

    this.frequencyBinCount = computeNumberBins(sampleRate);

    if (opts.workletAnalyser) {
      this.initializeWorkletCQTPath(opts.workletAnalyser, sampleRate);
    } else {
      this.initializeNativeCQTPath(source, sampleRate);
    }
  }

  getVisualizationData(): Uint8Array {
    if (this.workletAnalyser && this.workletCQTData) {
      return this.getWorkletCQTVisualizationData();
    }
    return this.getNativeCQTVisualizationData();
  }

  dispose(): void {
    if (this.workletAnalyser) {
      this.workletAnalyser.disableCQTAnalysis();
      this.workletAnalyser = null;
      this.workletCQTData = null;
      return;
    }

    if (this.nativeAnalyser) {
      this.nativeAnalyser.disconnect();
      this.nativeAnalyser = null;
      this.liveCQTAnalyser = null;
      this.timeDomainBuffer = null;
    }
  }

  // --- Worklet CQT path ---

  private initializeWorkletCQTPath(
    analyser: WorkletAnalyser,
    sampleRate: number,
  ): void {
    this.workletAnalyser = analyser;

    // Enable CQT analysis on the audio thread. This computes the
    // kernel, serializes it, and transfers it to the processor.
    analyser.enableCQTAnalysis(sampleRate);

    this.workletCQTData = new Uint8Array(this.frequencyBinCount);
  }

  private getWorkletCQTVisualizationData(): Uint8Array {
    this.workletAnalyser!.getCQTData(this.workletCQTData!);
    return this.workletCQTData!;
  }

  // --- Native fallback path (AnalyserNode + main-thread CQT) ---

  private initializeNativeCQTPath(
    source: Tone.ToneAudioNode,
    sampleRate: number,
  ): void {
    const toneCtx = source.context ?? Tone.context;
    const ctx = toneCtx.rawContext as AudioContext;

    // Use a large FFT size to get enough time-domain samples per read.
    // The CQT's longest kernel is ~4× hop size (~4400 samples at 44.1kHz).
    // An fftSize of 8192 provides plenty of coverage.
    const fftSize = 8192;

    this.nativeAnalyser = ctx.createAnalyser();
    this.nativeAnalyser.fftSize = fftSize;
    this.nativeAnalyser.smoothingTimeConstant = 0;

    source.connect(this.nativeAnalyser as unknown as AudioNode);

    this.liveCQTAnalyser = new LiveCQTAnalyser(sampleRate);
    this.timeDomainBuffer = new Float32Array(fftSize);
  }

  private getNativeCQTVisualizationData(): Uint8Array {
    if (!this.nativeAnalyser || !this.liveCQTAnalyser || !this.timeDomainBuffer)
      return new Uint8Array(this.frequencyBinCount);

    // Read time-domain samples and push through the CQT analyser
    this.nativeAnalyser.getFloatTimeDomainData(this.timeDomainBuffer);
    this.liveCQTAnalyser.push(this.timeDomainBuffer);

    return this.liveCQTAnalyser.getFrame();
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
