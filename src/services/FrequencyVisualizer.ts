/**
 * Live dual-band frequency visualization service.
 *
 * Connects to an audio source node in the Web Audio graph, splits the
 * signal at ~752 Hz via biquad filters, runs separate FFTs for the low
 * and high bands, merges them, and applies a log-frequency mapping.
 *
 * Consumers receive a ready-to-render Uint8Array (0–255) — no frequency
 * mapping details leak outside this module.
 */
import * as Tone from 'tone';
import { SPLIT_FREQUENCY } from './dualBandAnalysis';
import {
  applyLogFrequencyMapping,
  createDualBandLogMapping,
} from './logFrequencyMapping';

const SMOOTHING = 0;
const MIN_DECIBELS = -80;
const MAX_DECIBELS = -30;

// 16384-point FFT at native sample rate gives ~2.7 Hz/bin resolution,
// closely matching the offline pipeline's 2.5 Hz/bin (2048 FFT at 5120 Hz).
const LOW_FFT_SIZE = 16384;
const HIGH_FFT_SIZE = 1024;

class FrequencyVisualizer {
  readonly frequencyBinCount: number;

  private lowFilter: BiquadFilterNode;
  private highFilter: BiquadFilterNode;
  private lowAnalyser: AnalyserNode;
  private highAnalyser: AnalyserNode;
  private muter: GainNode;

  private lowData: Uint8Array<ArrayBuffer>;
  private highData: Uint8Array<ArrayBuffer>;
  private mergedData: Uint8Array<ArrayBuffer>;
  private outputData: Uint8Array<ArrayBuffer>;
  private logMapping: number[][];
  private lowBinCount: number;
  private highBinStart: number;
  private highBinEnd: number;

  constructor(source: Tone.ToneAudioNode) {
    const ctx = Tone.context.rawContext as AudioContext;
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
    this.frequencyBinCount = mergedBinCount;

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
  }

  getVisualizationData(): Uint8Array {
    this.lowAnalyser.getByteFrequencyData(this.lowData);
    this.highAnalyser.getByteFrequencyData(this.highData);

    for (let i = 0; i < this.lowBinCount; i++) {
      this.mergedData[i] = this.lowData[i];
    }
    for (let i = this.highBinStart; i < this.highBinEnd; i++) {
      this.mergedData[this.lowBinCount + i - this.highBinStart] =
        this.highData[i];
    }

    applyLogFrequencyMapping(this.mergedData, this.logMapping, this.outputData);

    return this.outputData;
  }

  dispose(): void {
    this.lowFilter.disconnect();
    this.highFilter.disconnect();
    this.lowAnalyser.disconnect();
    this.highAnalyser.disconnect();
    this.muter.disconnect();
  }
}

export default FrequencyVisualizer;
