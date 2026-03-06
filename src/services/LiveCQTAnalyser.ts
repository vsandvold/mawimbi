/**
 * Real-time CQT analyser for live frequency visualization.
 *
 * Wraps the same CQT kernel as the offline analyser (CQTAnalyser.ts) and
 * provides two capabilities:
 *
 * 1. **Kernel serialization** — packs the pre-computed CQT kernel into flat
 *    Float32Array buffers suitable for transfer to an AudioWorklet via
 *    postMessage + Transferable. The processor reconstructs the kernel
 *    structure from these arrays.
 *
 * 2. **Main-thread fallback** — maintains a ring buffer and computes CQT
 *    frames directly on the main thread from time-domain samples obtained
 *    via AnalyserNode.getFloatTimeDomainData(). Used when AudioWorklet
 *    is unavailable.
 *
 * Output format: Uint8Array with one byte per CQT bin (0–255), identical
 * to the offline CQTAnalyser output. Bins are log-spaced (24 bins/octave)
 * from 32.7 Hz (C1) to Nyquist.
 */

import {
  computeKernel,
  computeNumberBins,
  HOP_SECONDS,
  magnitudeToByte,
  type CQTKernel,
} from './CQTAnalyser';

// ---------------------------------------------------------------------------
// Kernel serialization for AudioWorklet transfer
// ---------------------------------------------------------------------------

/**
 * Serialized kernel data suitable for Transferable postMessage.
 *
 * The kernel bins are packed into flat arrays so they can be transferred
 * to the AudioWorklet without structured cloning overhead.
 */
export type SerializedCQTKernel = {
  /** Flat buffer: all cosValues concatenated. */
  cosBuffer: Float32Array;
  /** Flat buffer: all sinValues concatenated. */
  sinBuffer: Float32Array;
  /** Per-bin kernel lengths. */
  binLengths: Uint32Array;
  /** Total number of CQ bins. */
  numberBins: number;
  /** Hop size in samples. */
  hopSize: number;
};

/**
 * Serializes a CQT kernel into flat transferable arrays.
 */
export function serializeKernel(kernel: CQTKernel): SerializedCQTKernel {
  const { bins, numberBins, hopSize } = kernel;

  const binLengths = new Uint32Array(numberBins);
  let totalLength = 0;
  for (let k = 0; k < numberBins; k++) {
    binLengths[k] = bins[k].length;
    totalLength += bins[k].length;
  }

  const cosBuffer = new Float32Array(totalLength);
  const sinBuffer = new Float32Array(totalLength);

  let offset = 0;
  for (let k = 0; k < numberBins; k++) {
    cosBuffer.set(bins[k].cosValues, offset);
    sinBuffer.set(bins[k].sinValues, offset);
    offset += bins[k].length;
  }

  return { cosBuffer, sinBuffer, binLengths, numberBins, hopSize };
}

/**
 * Returns the Transferable buffers from a serialized kernel, for use
 * with postMessage's transfer list.
 */
export function getTransferables(
  serialized: SerializedCQTKernel,
): ArrayBuffer[] {
  return [
    serialized.cosBuffer.buffer as ArrayBuffer,
    serialized.sinBuffer.buffer as ArrayBuffer,
    serialized.binLengths.buffer as ArrayBuffer,
  ];
}

// ---------------------------------------------------------------------------
// Main-thread CQT analyser (fallback when AudioWorklet is unavailable)
// ---------------------------------------------------------------------------

class LiveCQTAnalyser {
  readonly numberBins: number;

  private kernel: CQTKernel;
  private ringBuffer: Float32Array;
  private ringWritePos = 0;
  private ringFilled = 0;
  private hopSize: number;
  private maxKernelLength: number;
  private samplesUntilFrame: number;
  private outputFrame: Uint8Array;

  constructor(sampleRate: number) {
    this.kernel = computeKernel(sampleRate);
    this.numberBins = this.kernel.numberBins;
    this.hopSize = this.kernel.hopSize;

    // Ring buffer must hold at least the longest kernel
    this.maxKernelLength = 0;
    for (const bin of this.kernel.bins) {
      if (bin.length > this.maxKernelLength) {
        this.maxKernelLength = bin.length;
      }
    }
    // Use at least 2x max kernel length for safe centering
    const ringSize = Math.max(this.maxKernelLength * 2, this.hopSize * 4);
    this.ringBuffer = new Float32Array(ringSize);
    this.samplesUntilFrame = this.hopSize;
    this.outputFrame = new Uint8Array(this.numberBins);
  }

  /**
   * Feed time-domain samples into the analyser. After enough samples
   * accumulate (one hop), a new CQT frame is computed internally.
   */
  push(samples: Float32Array): void {
    const ring = this.ringBuffer;
    const ringLen = ring.length;

    for (let i = 0; i < samples.length; i++) {
      ring[this.ringWritePos] = samples[i];
      this.ringWritePos = (this.ringWritePos + 1) % ringLen;
      this.ringFilled = Math.min(this.ringFilled + 1, ringLen);
    }

    this.samplesUntilFrame -= samples.length;
    if (this.samplesUntilFrame > 0) return;
    this.samplesUntilFrame += this.hopSize;

    this.computeCurrentFrame();
  }

  /**
   * Returns the latest CQT frame (0–255 per bin).
   * The returned array is reused between calls — copy if you need to store it.
   */
  getFrame(): Uint8Array {
    return this.outputFrame;
  }

  /**
   * Copies the latest CQT frame into the provided output array.
   * Returns true if data is available.
   */
  getByteFrequencyData(output: Uint8Array): boolean {
    output.set(this.outputFrame.subarray(0, output.length));
    return true;
  }

  /**
   * Returns a serialized version of the kernel for transfer to an
   * AudioWorklet processor.
   */
  getSerializedKernel(): SerializedCQTKernel {
    return serializeKernel(this.kernel);
  }

  private computeCurrentFrame(): void {
    const { bins, numberBins } = this.kernel;
    const ring = this.ringBuffer;
    const ringLen = ring.length;
    const output = this.outputFrame;

    // The "center" of the analysis window is the most recent sample
    // minus half a hop. This aligns with the offline CQT convention.
    const centerPos =
      (this.ringWritePos - 1 - (this.hopSize >> 1) + ringLen) % ringLen;

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
  }
}

export default LiveCQTAnalyser;

// Re-export for convenience
export { computeKernel, computeNumberBins, HOP_SECONDS };
