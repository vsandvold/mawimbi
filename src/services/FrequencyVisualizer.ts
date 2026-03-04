/**
 * Live frequency visualization service.
 *
 * Two analysis paths:
 *
 * 1. **WorkletAnalyser** (preferred) — FFT runs on the audio thread via
 *    AudioWorkletProcessor, eliminating main-thread contention. Receives
 *    uniform frequency bins and applies log-frequency mapping on the main
 *    thread.
 *
 * 2. **Dual-band AnalyserNode** (fallback) — splits the signal at ~752 Hz
 *    via biquad filters, runs separate FFTs for the low and high bands,
 *    merges them, and applies a dual-band log-frequency mapping. Used when
 *    AudioWorklet is unavailable.
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
import type WorkletAnalyser from './WorkletAnalyser';

const SMOOTHING = 0;
const MIN_DECIBELS = -80;
const MAX_DECIBELS = -30;

// Dual-band fallback FFT sizes
// 16384-point FFT at native sample rate gives ~2.7 Hz/bin resolution,
// closely matching the offline pipeline's 2.5 Hz/bin (2048 FFT at 5120 Hz).
const LOW_FFT_SIZE = 16384;
const HIGH_FFT_SIZE = 1024;

// Worklet path FFT size. 2048 gives ~21.5 Hz/bin at 44.1 kHz — moderate
// resolution suitable for real-time visualization. The dual-band approach
// offers finer low-frequency resolution but requires native AnalyserNodes
// on the main thread.
const WORKLET_FFT_SIZE = 2048;

class FrequencyVisualizer {
  readonly frequencyBinCount: number;

  // Worklet path state
  private workletAnalyser: WorkletAnalyser | null = null;
  private workletData: Uint8Array<ArrayBuffer> | null = null;
  private workletOutput: Uint8Array<ArrayBuffer> | null = null;
  private workletLogMapping: number[][] | null = null;

  // Dual-band fallback state
  private lowFilter: BiquadFilterNode | null = null;
  private highFilter: BiquadFilterNode | null = null;
  private lowAnalyser: AnalyserNode | null = null;
  private highAnalyser: AnalyserNode | null = null;
  private muter: GainNode | null = null;

  private lowData: Uint8Array<ArrayBuffer> | null = null;
  private highData: Uint8Array<ArrayBuffer> | null = null;
  private mergedData: Uint8Array<ArrayBuffer> | null = null;
  private outputData: Uint8Array<ArrayBuffer> | null = null;
  private logMapping: number[][] | null = null;
  private lowBinCount = 0;
  private highBinStart = 0;
  private highBinEnd = 0;

  constructor(source: Tone.ToneAudioNode, workletAnalyser?: WorkletAnalyser) {
    if (workletAnalyser) {
      this.workletAnalyser = workletAnalyser;
      this.initializeWorkletPath(workletAnalyser);
      this.frequencyBinCount = workletAnalyser.frequencyBinCount;
    } else {
      this.frequencyBinCount = this.initializeDualBandPath(source);
    }
  }

  getVisualizationData(): Uint8Array {
    if (this.workletAnalyser && this.workletData && this.workletOutput) {
      return this.getWorkletVisualizationData();
    }
    return this.getDualBandVisualizationData();
  }

  dispose(): void {
    if (this.workletAnalyser) {
      this.workletAnalyser.disableFrequencyAnalysis();
      this.workletAnalyser = null;
      this.workletData = null;
      this.workletOutput = null;
      this.workletLogMapping = null;
      return;
    }

    this.lowFilter?.disconnect();
    this.highFilter?.disconnect();
    this.lowAnalyser?.disconnect();
    this.highAnalyser?.disconnect();
    this.muter?.disconnect();
  }

  // --- Worklet path ---

  private initializeWorkletPath(analyser: WorkletAnalyser): void {
    analyser.enableFrequencyAnalysis({
      fftSize: WORKLET_FFT_SIZE,
      minDecibels: MIN_DECIBELS,
      maxDecibels: MAX_DECIBELS,
    });

    const binCount = analyser.frequencyBinCount;
    this.workletData = new Uint8Array(binCount);
    this.workletOutput = new Uint8Array(binCount);
    this.workletLogMapping = createLogFrequencyMapping(binCount);
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

  // --- Dual-band fallback ---

  private initializeDualBandPath(source: Tone.ToneAudioNode): number {
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
    );

    this.lowData = new Uint8Array(this.lowAnalyser.frequencyBinCount);
    this.highData = new Uint8Array(this.highAnalyser.frequencyBinCount);
    this.mergedData = new Uint8Array(mergedBinCount);
    this.outputData = new Uint8Array(mergedBinCount);

    return mergedBinCount;
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

export default FrequencyVisualizer;
