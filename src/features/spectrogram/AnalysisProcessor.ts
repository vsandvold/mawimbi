// AnalysisProcessor — AudioWorkletProcessor that computes RMS loudness
// and CQT frequency analysis on the audio thread.
//
// Runs inside an AudioWorklet scope on a dedicated thread, eliminating
// main-thread contention during complex playback with many tracks.
//
// CQT frequency analysis — Constant-Q Transform using pre-computed kernels
// transferred from the main thread. Produces the same log-frequency output
// as the offline CQT analyser. Enabled via `cqtAnalysis: true` with kernel
// data. Posts `cqtData` messages.
//
// Message protocol:
//   Processor → Main:  { type: 'loudness', rms: number }
//   Processor → Main:  { type: 'cqtData', bins: Uint8Array }
//   Main → Processor:  { type: 'configure', ... }

export type AnalysisMessage =
  | { type: 'loudness'; rms: number }
  | { type: 'cqtData'; bins: Uint8Array };

export type AnalysisCommand = {
  type: 'configure';
  smoothing?: number;
  cqtAnalysis?: boolean;
  cqtKernel?: {
    cosBuffer: Float32Array;
    sinBuffer: Float32Array;
    binLengths: Uint32Array;
    numberBins: number;
    hopSize: number;
  };
};

// Exponential moving average coefficient. Higher values = smoother but
// more latent meter response.
const DEFAULT_SMOOTHING = 0.8;

// How often to post loudness updates. Every N-th process() call.
// At 128 samples / 44100 Hz ≈ 2.9ms per call, 8 calls ≈ 23ms ≈ 43 Hz
// update rate — sufficient for smooth meter animation.
const REPORT_INTERVAL = 8;

// CQT dB range matching CQTAnalyser.ts
const CQT_MIN_DECIBELS = -80;
const CQT_MAX_DECIBELS = -30;

// ---------------------------------------------------------------------------
// CQT kernel representation on the audio thread
// ---------------------------------------------------------------------------

type CQTBin = {
  cosValues: Float32Array;
  sinValues: Float32Array;
  length: number;
};

type CQTKernelState = {
  bins: CQTBin[];
  numberBins: number;
  hopSize: number;
  maxKernelLength: number;
};

/**
 * Reconstructs the CQT kernel from flat transferred arrays.
 */
function deserializeKernel(
  cosBuffer: Float32Array,
  sinBuffer: Float32Array,
  binLengths: Uint32Array,
  numberBins: number,
  hopSize: number,
): CQTKernelState {
  const bins: CQTBin[] = new Array(numberBins);
  let offset = 0;
  let maxKernelLength = 0;

  for (let k = 0; k < numberBins; k++) {
    const len = binLengths[k];
    bins[k] = {
      cosValues: cosBuffer.subarray(offset, offset + len),
      sinValues: sinBuffer.subarray(offset, offset + len),
      length: len,
    };
    if (len > maxKernelLength) maxKernelLength = len;
    offset += len;
  }

  return { bins, numberBins, hopSize, maxKernelLength };
}

class AnalysisProcessor extends AudioWorkletProcessor {
  private smoothing = DEFAULT_SMOOTHING;
  private smoothedRms = 0;
  private callCount = 0;

  // CQT analysis state (lazily allocated on enable)
  private cqtEnabled = false;
  private cqtKernel: CQTKernelState | null = null;
  private cqtRingBuffer: Float32Array | null = null;
  private cqtRingWritePos = 0;
  private samplesUntilCqt = 0;

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

    // CQT frequency analysis
    if (this.cqtEnabled && this.cqtRingBuffer && this.cqtKernel) {
      this.accumulateAndAnalyseCQT(channelData);
    }

    return true;
  }

  private handleConfigure(cmd: AnalysisCommand): void {
    if (cmd.smoothing !== undefined) {
      this.smoothing = cmd.smoothing;
    }

    // CQT analysis
    if (cmd.cqtAnalysis !== undefined) {
      this.cqtEnabled = cmd.cqtAnalysis;
    }
    if (cmd.cqtKernel) {
      const k = cmd.cqtKernel;
      this.cqtKernel = deserializeKernel(
        k.cosBuffer,
        k.sinBuffer,
        k.binLengths,
        k.numberBins,
        k.hopSize,
      );
      this.initCQTBuffers();
    }
  }

  // --- CQT analysis ---

  private initCQTBuffers(): void {
    if (!this.cqtKernel) return;

    // Ring buffer must hold at least the longest kernel for safe centering
    const ringSize = Math.max(
      this.cqtKernel.maxKernelLength * 2,
      this.cqtKernel.hopSize * 4,
    );
    this.cqtRingBuffer = new Float32Array(ringSize);
    this.cqtRingWritePos = 0;
    this.samplesUntilCqt = this.cqtKernel.hopSize;
  }

  private accumulateAndAnalyseCQT(channelData: Float32Array): void {
    const ring = this.cqtRingBuffer!;
    const ringLen = ring.length;
    const kernel = this.cqtKernel!;

    // Write incoming samples into the ring buffer
    for (let i = 0; i < channelData.length; i++) {
      ring[this.cqtRingWritePos] = channelData[i];
      this.cqtRingWritePos = (this.cqtRingWritePos + 1) % ringLen;
    }

    this.samplesUntilCqt -= channelData.length;
    if (this.samplesUntilCqt > 0) return;

    // Reset countdown for next CQT frame
    this.samplesUntilCqt += kernel.hopSize;

    // Compute CQT frame
    const { bins, numberBins } = kernel;
    const output = new Uint8Array(numberBins);

    // Center of analysis window is the most recent sample minus half a hop
    const centerPos =
      (this.cqtRingWritePos - 1 - (kernel.hopSize >> 1) + ringLen) % ringLen;

    for (let k = 0; k < numberBins; k++) {
      const bin = bins[k];
      const halfLength = bin.length >> 1;
      const startPos = (centerPos - halfLength + ringLen) % ringLen;

      let sumReal = 0;
      let sumImag = 0;
      const cosVals = bin.cosValues;
      const sinVals = bin.sinValues;

      for (let n = 0; n < bin.length; n++) {
        const sample = ring[(startPos + n) % ringLen];
        sumReal += sample * cosVals[n];
        sumImag += sample * sinVals[n];
      }

      const magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
      output[k] = magnitudeToByte(magnitude);
    }

    this.port.postMessage(
      { type: 'cqtData', bins: output } satisfies AnalysisMessage,
      [output.buffer],
    );
  }
}

/**
 * Converts a linear magnitude to a byte value (0–255) using a dB scale.
 * Matches the CQTAnalyser.magnitudeToByte() function.
 */
function magnitudeToByte(magnitude: number): number {
  if (magnitude <= 0) return 0;
  const db = 20 * Math.log10(magnitude);
  const normalized =
    (db - CQT_MIN_DECIBELS) / (CQT_MAX_DECIBELS - CQT_MIN_DECIBELS);
  if (normalized <= 0) return 0;
  if (normalized >= 1) return 255;
  return Math.round(normalized * 255);
}

registerProcessor('analysis-processor', AnalysisProcessor);

// Exported for testing (registerProcessor above is the real worklet entry
// point; the class itself is only otherwise reachable from inside worklet
// scope).
export default AnalysisProcessor;
