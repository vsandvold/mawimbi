// AnalysisProcessor — AudioWorkletProcessor that computes RMS loudness
// and optional FFT frequency analysis on the audio thread.
//
// Runs inside an AudioWorklet scope on a dedicated thread, eliminating
// main-thread contention during complex playback with many tracks.
//
// Frequency analysis is opt-in: send a 'configure' command with
// frequencyAnalysis: true to enable it. When enabled, the processor
// accumulates samples into a ring buffer, applies a Hann window, runs
// a Cooley-Tukey radix-2 FFT, and posts byte-scaled magnitude bins
// (0–255, matching AnalyserNode.getByteFrequencyData conventions).
//
// Message protocol:
//   Processor → Main:  { type: 'loudness', rms: number }
//   Processor → Main:  { type: 'frequencyData', bins: Uint8Array }
//   Main → Processor:  { type: 'configure', ... }

import { createHannWindow, fft, magnitudeToBytes } from './fft';

export type AnalysisMessage =
  | { type: 'loudness'; rms: number }
  | { type: 'frequencyData'; bins: Uint8Array };

export type AnalysisCommand = {
  type: 'configure';
  smoothing?: number;
  frequencyAnalysis?: boolean;
  fftSize?: number;
  minDecibels?: number;
  maxDecibels?: number;
};

// Exponential moving average coefficient. Higher values = smoother but
// more latent meter response.
const DEFAULT_SMOOTHING = 0.8;

// How often to post loudness updates. Every N-th process() call.
// At 128 samples / 44100 Hz ≈ 2.9ms per call, 8 calls ≈ 23ms ≈ 43 Hz
// update rate — sufficient for smooth meter animation.
const REPORT_INTERVAL = 8;

const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_MIN_DECIBELS = -100;
const DEFAULT_MAX_DECIBELS = -30;

class AnalysisProcessor extends AudioWorkletProcessor {
  private smoothing = DEFAULT_SMOOTHING;
  private smoothedRms = 0;
  private callCount = 0;

  // Frequency analysis state (lazily allocated on enable)
  private frequencyEnabled = false;
  private fftSize = DEFAULT_FFT_SIZE;
  private minDecibels = DEFAULT_MIN_DECIBELS;
  private maxDecibels = DEFAULT_MAX_DECIBELS;
  private ringBuffer: Float32Array | null = null;
  private ringWritePos = 0;
  private hannWindow: Float32Array | null = null;
  private samplesUntilFft = 0;
  private hopSize = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<AnalysisCommand>) => {
      if (event.data.type === 'configure') {
        this.handleConfigure(event.data);
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // RMS calculation on the audio thread
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    const instantRms = Math.sqrt(sumSquares / channelData.length);

    // Exponential moving average for smoothing
    this.smoothedRms =
      this.smoothing * this.smoothedRms + (1 - this.smoothing) * instantRms;

    this.callCount++;
    if (this.callCount >= REPORT_INTERVAL) {
      this.callCount = 0;
      this.port.postMessage({
        type: 'loudness',
        rms: this.smoothedRms,
      } satisfies AnalysisMessage);
    }

    // Frequency analysis: accumulate samples and run FFT when ready
    if (this.frequencyEnabled && this.ringBuffer) {
      this.accumulateAndAnalyse(channelData);
    }

    return true;
  }

  private handleConfigure(cmd: AnalysisCommand): void {
    if (cmd.smoothing !== undefined) {
      this.smoothing = cmd.smoothing;
    }
    if (cmd.minDecibels !== undefined) {
      this.minDecibels = cmd.minDecibels;
    }
    if (cmd.maxDecibels !== undefined) {
      this.maxDecibels = cmd.maxDecibels;
    }

    const fftSizeChanged =
      cmd.fftSize !== undefined && cmd.fftSize !== this.fftSize;
    if (fftSizeChanged) {
      this.fftSize = cmd.fftSize!;
    }

    if (cmd.frequencyAnalysis !== undefined) {
      this.frequencyEnabled = cmd.frequencyAnalysis;
    }

    // (Re-)allocate buffers when enabling or changing FFT size
    if (this.frequencyEnabled && (!this.ringBuffer || fftSizeChanged)) {
      this.initFrequencyBuffers();
    }
  }

  private initFrequencyBuffers(): void {
    this.ringBuffer = new Float32Array(this.fftSize);
    this.hannWindow = createHannWindow(this.fftSize);
    this.ringWritePos = 0;
    // Hop size = fftSize / 4 gives 75% overlap.
    // At 44.1 kHz with fftSize=2048: hop=512 → ~86 Hz update rate.
    this.hopSize = this.fftSize / 4;
    this.samplesUntilFft = this.fftSize;
  }

  private accumulateAndAnalyse(channelData: Float32Array): void {
    const ring = this.ringBuffer!;
    const fftSize = this.fftSize;

    // Write incoming samples into the ring buffer
    for (let i = 0; i < channelData.length; i++) {
      ring[this.ringWritePos] = channelData[i];
      this.ringWritePos = (this.ringWritePos + 1) % fftSize;
    }

    this.samplesUntilFft -= channelData.length;
    if (this.samplesUntilFft > 0) return;

    // Reset countdown for next FFT
    this.samplesUntilFft += this.hopSize;

    // Copy ring buffer into FFT input with Hann window applied.
    // ringWritePos points to the oldest sample, so we read from there
    // wrapping around to get the most recent fftSize samples in order.
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    const window = this.hannWindow!;

    for (let i = 0; i < fftSize; i++) {
      const idx = (this.ringWritePos + i) % fftSize;
      real[i] = ring[idx] * window[i];
    }

    fft(real, imag);

    const bins = new Uint8Array(fftSize / 2);
    magnitudeToBytes(
      real,
      imag,
      fftSize,
      this.minDecibels,
      this.maxDecibels,
      bins,
    );

    this.port.postMessage(
      { type: 'frequencyData', bins } satisfies AnalysisMessage,
      [bins.buffer],
    );
  }
}

registerProcessor('analysis-processor', AnalysisProcessor);
