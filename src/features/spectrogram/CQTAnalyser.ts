/**
 * Constant-Q Transform (CQT) analyser for spectrogram generation.
 *
 * Replaces the multi-band STFT pipeline with a single coherent CQT that
 * produces log-frequency bins with constant Q-factor. Each frequency bin
 * has the same Δf/f ratio, giving uniform perceptual resolution across
 * the entire frequency range — no band-boundary artifacts.
 *
 * Uses a direct time-domain CQT with pre-computed kernels. The kernel
 * for each CQ bin is a windowed complex exponential whose length varies
 * with frequency: low-frequency bins use longer windows (better frequency
 * resolution), high-frequency bins use shorter windows (better temporal
 * resolution). This is the defining property of the CQT and what
 * distinguishes it from STFT-based approaches.
 *
 * Performance: kernel pre-computation runs once per sample rate. Per-frame
 * computation exploits the variable kernel lengths — high-frequency bins
 * are cheap because their kernels are short. A 10-second track at 44.1 kHz
 * typically analyses in < 1 second.
 */

import { type SpectrogramData } from './OfflineAnalyser';

// ---------------------------------------------------------------------------
// CQT parameters
// ---------------------------------------------------------------------------

const BINS_PER_OCTAVE = 24;
const MIN_FREQUENCY = 32.7; // C1 — lowest musically useful frequency
const MIN_DECIBELS = -80;
const MAX_DECIBELS = -30;

/**
 * Q-factor: ratio of center frequency to bandwidth for each CQ bin.
 * Higher Q means narrower bandwidth relative to frequency.
 * For 24 bins/octave: Q ≈ 34.1
 */
const Q_FACTOR = 1 / (2 ** (1 / BINS_PER_OCTAVE) - 1);

/**
 * Hop size in seconds. Matches the time resolution of the previous
 * multi-band STFT pipeline (SUSPEND_INTERVAL = 0.025s).
 */
const HOP_SECONDS = 0.025;

/**
 * Maximum kernel length as a multiple of the hop size. Without a cap, the
 * constant-Q formula gives kernel lengths up to ~46,000 samples (~1 second)
 * at the lowest frequency bin. A transient then smears across ~40 frames,
 * creating visible cone-shaped artifacts in the spectrogram. Capping at a
 * few hops limits temporal smearing while preserving the CQT's log-frequency
 * property at higher frequencies.
 */
const MAX_KERNEL_HOPS = 4;

// ---------------------------------------------------------------------------
// CQT kernel
// ---------------------------------------------------------------------------

type CQTBinKernel = {
  /** Cosine component of the windowed complex exponential. */
  cosValues: Float32Array;
  /** Sine component (negated for conjugate correlation). */
  sinValues: Float32Array;
  /** Number of samples in this kernel (varies per bin). */
  length: number;
};

type CQTKernel = {
  bins: CQTBinKernel[];
  numberBins: number;
  hopSize: number;
};

/**
 * Computes the number of CQ bins needed to cover the audible range.
 * Bins span from MIN_FREQUENCY up to (but not exceeding) Nyquist.
 */
function computeNumberBins(sampleRate: number): number {
  const nyquist = sampleRate / 2;
  return Math.floor(BINS_PER_OCTAVE * Math.log2(nyquist / MIN_FREQUENCY));
}

/**
 * Pre-computes the CQT kernel for a given sample rate.
 *
 * Each CQ bin k has center frequency f_k = minFreq × 2^(k/B) and a
 * Hann-windowed complex exponential kernel of length N_k = ⌈Q × sr / f_k⌉.
 * Low-frequency bins have long kernels (thousands of samples); high-
 * frequency bins have short kernels (tens of samples). The 1/N_k
 * normalisation ensures energy-independent magnitudes across bins.
 */
function computeKernel(sampleRate: number): CQTKernel {
  const numberBins = computeNumberBins(sampleRate);
  const hopSize = Math.round(HOP_SECONDS * sampleRate);
  const maxKernelLength = hopSize * MAX_KERNEL_HOPS;

  const bins: CQTBinKernel[] = new Array(numberBins);

  for (let k = 0; k < numberBins; k++) {
    const freq = MIN_FREQUENCY * 2 ** (k / BINS_PER_OCTAVE);
    const Nk = Math.min(
      Math.ceil((Q_FACTOR * sampleRate) / freq),
      maxKernelLength,
    );
    const norm = 1 / Nk;
    const angularFreq = (2 * Math.PI * freq) / sampleRate;

    const cosValues = new Float32Array(Nk);
    const sinValues = new Float32Array(Nk);

    for (let n = 0; n < Nk; n++) {
      // Hann window
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / Nk));
      const wn = window * norm;
      const phase = angularFreq * n;
      cosValues[n] = wn * Math.cos(phase);
      // Negated sin for conjugate correlation
      sinValues[n] = wn * -Math.sin(phase);
    }

    bins[k] = { cosValues, sinValues, length: Nk };
  }

  return { bins, numberBins, hopSize };
}

// ---------------------------------------------------------------------------
// Signal processing
// ---------------------------------------------------------------------------

/**
 * Mixes multi-channel audio to mono by averaging all channels.
 */
function mixToMono(channelData: Float32Array[], length: number): Float32Array {
  if (channelData.length === 1) {
    return channelData[0];
  }
  const mono = new Float32Array(length);
  const numChannels = channelData.length;
  const scale = 1 / numChannels;
  for (let ch = 0; ch < numChannels; ch++) {
    const channel = channelData[ch];
    for (let i = 0; i < length; i++) {
      mono[i] += channel[i] * scale;
    }
  }
  return mono;
}

/**
 * Converts a linear magnitude to a byte value (0–255) using a dB scale.
 *
 * The dB range [MIN_DECIBELS, MAX_DECIBELS] maps linearly to [0, 255].
 * Values below MIN_DECIBELS clamp to 0; values above MAX_DECIBELS clamp
 * to 255. Matches the AnalyserNode.getByteFrequencyData() convention.
 */
function magnitudeToByte(magnitude: number): number {
  if (magnitude <= 0) return 0;
  const db = 20 * Math.log10(magnitude);
  const normalized = (db - MIN_DECIBELS) / (MAX_DECIBELS - MIN_DECIBELS);
  if (normalized <= 0) return 0;
  if (normalized >= 1) return 255;
  return Math.round(normalized * 255);
}

// ---------------------------------------------------------------------------
// CQT analysis
// ---------------------------------------------------------------------------

/**
 * Computes one CQT frame at a given sample offset.
 *
 * Each CQ bin's kernel is centered at the hop position. Samples outside
 * the signal bounds are treated as zero (implicit zero-padding).
 */
function computeFrame(
  signal: Float32Array,
  signalLength: number,
  kernel: CQTKernel,
  hopPosition: number,
  output: Uint8Array,
): void {
  const { bins, numberBins } = kernel;

  for (let k = 0; k < numberBins; k++) {
    const bin = bins[k];
    const halfLength = bin.length >> 1;
    const startSample = hopPosition - halfLength;

    let sumReal = 0;
    let sumImag = 0;

    // Determine the overlap between kernel and signal
    const nStart = Math.max(0, -startSample);
    const nEnd = Math.min(bin.length, signalLength - startSample);

    const cosVals = bin.cosValues;
    const sinVals = bin.sinValues;

    for (let n = nStart; n < nEnd; n++) {
      const sample = signal[startSample + n];
      sumReal += sample * cosVals[n];
      sumImag += sample * sinVals[n];
    }

    const magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
    output[k] = magnitudeToByte(magnitude);
  }
}

/**
 * Runs CQT analysis on audio data, optionally delivering frames in chunks
 * as they're computed.
 *
 * Chunking is purely about *emission* boundaries, not new DSP: every frame
 * is still computed the same way, from the same full in-memory `signal`
 * and the same precomputed `kernel` (no re-priming, no per-chunk slicing
 * of the input audio) — so `onChunk`'s delivered frames are always
 * byte-identical to the corresponding slice of the final, single returned
 * `SpectrogramData` (mawimbi#539, spec 006 milestone 2 — verified by
 * `chunkedAnalysis.test.ts` rather than assumed). `onChunk` fires once per
 * `chunkFrames`-sized group of newly computed frames, and once more for a
 * final, possibly-shorter group; each call receives that group's frames
 * (not the cumulative total) and the frame index it starts at.
 *
 * This is also the main entry point for both the web worker and the
 * main-thread fallback path (via `analyseCQT` below, a fixed-chunk-size
 * wrapper). It produces the same SpectrogramData output type as the
 * previous multi-band STFT pipeline.
 */
export function analyseCQTChunked(
  channelData: Float32Array[],
  sampleRate: number,
  length: number,
  chunkFrames: number,
  onChunk?: (frames: Uint8Array[], startFrame: number) => void,
): SpectrogramData {
  const kernel = computeKernel(sampleRate);
  const { numberBins, hopSize } = kernel;
  const duration = length / sampleRate;

  const signal = mixToMono(channelData, length);

  const frameCount = Math.floor(duration / HOP_SECONDS);
  const frequencyFrames: Uint8Array[] = new Array(frameCount);

  let chunkStart = 0;
  for (let f = 0; f < frameCount; f++) {
    const hopPosition = (f + 1) * hopSize;
    const frame = new Uint8Array(numberBins);
    computeFrame(signal, length, kernel, hopPosition, frame);
    frequencyFrames[f] = frame;

    const isChunkBoundary = f - chunkStart + 1 === chunkFrames;
    const isLastFrame = f === frameCount - 1;
    if (isChunkBoundary || isLastFrame) {
      onChunk?.(frequencyFrames.slice(chunkStart, f + 1), chunkStart);
      chunkStart = f + 1;
    }
  }

  return {
    frequencyFrames,
    timeResolution: HOP_SECONDS,
    frequencyBinCount: numberBins,
    sampleRate,
    duration,
  };
}

/**
 * Runs CQT analysis on audio data and returns spectrogram frames in one
 * pass, with no incremental delivery. A thin wrapper over
 * `analyseCQTChunked` with an unreachable chunk boundary — the single
 * source of truth for the per-frame computation guarantees this is always
 * byte-identical to any chunked call over the same input.
 */
export function analyseCQT(
  channelData: Float32Array[],
  sampleRate: number,
  length: number,
): SpectrogramData {
  return analyseCQTChunked(channelData, sampleRate, length, Infinity);
}

/**
 * Runs CQT analysis on an AudioBuffer (main-thread fallback path).
 */
export function analyseCQTFromAudioBuffer(
  audioBuffer: AudioBuffer,
): SpectrogramData {
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    channelData.push(audioBuffer.getChannelData(ch));
  }
  return analyseCQT(channelData, audioBuffer.sampleRate, audioBuffer.length);
}

// Exported for testing
export {
  BINS_PER_OCTAVE,
  MIN_FREQUENCY,
  Q_FACTOR,
  HOP_SECONDS,
  MAX_KERNEL_HOPS,
  MIN_DECIBELS,
  MAX_DECIBELS,
  computeNumberBins,
  computeKernel,
  magnitudeToByte,
  mixToMono,
};
export type { CQTKernel, CQTBinKernel };
