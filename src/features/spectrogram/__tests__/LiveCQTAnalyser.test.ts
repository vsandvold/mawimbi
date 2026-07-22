import LiveCQTAnalyser, {
  serializeKernel,
  getTransferables,
  computeNumberBins,
} from '../LiveCQTAnalyser';
import { computeKernel } from '../CQTAnalyser';
import { findPeakBin } from './cqtTestHelpers';

const SAMPLE_RATE = 44100;

describe('LiveCQTAnalyser', () => {
  it('has the correct number of CQT bins', () => {
    const analyser = new LiveCQTAnalyser(SAMPLE_RATE);
    expect(analyser.numberBins).toBe(computeNumberBins(SAMPLE_RATE));
  });

  it('returns an all-zero frame before any data is pushed', () => {
    const analyser = new LiveCQTAnalyser(SAMPLE_RATE);
    const frame = analyser.getFrame();

    expect(frame).toBeInstanceOf(Uint8Array);
    expect(frame.length).toBe(analyser.numberBins);
    expect(frame.every((v) => v === 0)).toBe(true);
  });

  it('detects a 440 Hz sine wave at the correct CQT bin', () => {
    const analyser = new LiveCQTAnalyser(SAMPLE_RATE);

    // Generate 0.5 seconds of a 440 Hz sine wave
    const duration = 0.5;
    const totalSamples = Math.ceil(duration * SAMPLE_RATE);
    const chunkSize = 128;

    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      const chunk = new Float32Array(
        Math.min(chunkSize, totalSamples - offset),
      );
      for (let i = 0; i < chunk.length; i++) {
        chunk[i] = Math.sin((2 * Math.PI * 440 * (offset + i)) / SAMPLE_RATE);
      }
      analyser.push(chunk);
    }

    const frame = analyser.getFrame();
    const expectedBin = Math.round(24 * Math.log2(440 / 32.7));

    const peakBin = findPeakBin(frame);

    expect(Math.abs(peakBin - expectedBin)).toBeLessThanOrEqual(1);
    expect(frame[peakBin]).toBeGreaterThan(0);
  });

  it('produces all-zero frames for silence', () => {
    const analyser = new LiveCQTAnalyser(SAMPLE_RATE);

    // Push enough silence to trigger at least one frame
    const silence = new Float32Array(4096);
    analyser.push(silence);

    const frame = analyser.getFrame();
    expect(frame.every((v) => v === 0)).toBe(true);
  });

  it('copies frame data via getByteFrequencyData', () => {
    const analyser = new LiveCQTAnalyser(SAMPLE_RATE);
    const output = new Uint8Array(analyser.numberBins);

    const result = analyser.getByteFrequencyData(output);

    expect(result).toBe(true);
    expect(output.length).toBe(analyser.numberBins);
  });

  it('returns a serialized kernel for worklet transfer', () => {
    const analyser = new LiveCQTAnalyser(SAMPLE_RATE);
    const serialized = analyser.getSerializedKernel();

    expect(serialized.numberBins).toBe(analyser.numberBins);
    expect(serialized.hopSize).toBeGreaterThan(0);
    expect(serialized.cosBuffer).toBeInstanceOf(Float32Array);
    expect(serialized.sinBuffer).toBeInstanceOf(Float32Array);
    expect(serialized.binLengths).toBeInstanceOf(Uint32Array);
    expect(serialized.cosBuffer.length).toBe(serialized.sinBuffer.length);
    expect(serialized.binLengths.length).toBe(serialized.numberBins);
  });
});

describe('serializeKernel', () => {
  it('packs kernel bins into flat arrays', () => {
    const kernel = computeKernel(SAMPLE_RATE);
    const serialized = serializeKernel(kernel);

    expect(serialized.numberBins).toBe(kernel.numberBins);
    expect(serialized.hopSize).toBe(kernel.hopSize);

    // Total length should be sum of all bin lengths
    let totalLength = 0;
    for (const bin of kernel.bins) {
      totalLength += bin.length;
    }
    expect(serialized.cosBuffer.length).toBe(totalLength);
    expect(serialized.sinBuffer.length).toBe(totalLength);
  });

  it('preserves kernel values', () => {
    const kernel = computeKernel(SAMPLE_RATE);
    const serialized = serializeKernel(kernel);

    // Verify first bin's values are preserved
    const firstBin = kernel.bins[0];
    for (let i = 0; i < firstBin.length; i++) {
      expect(serialized.cosBuffer[i]).toBe(firstBin.cosValues[i]);
      expect(serialized.sinBuffer[i]).toBe(firstBin.sinValues[i]);
    }
  });
});

describe('getTransferables', () => {
  it('returns three ArrayBuffers', () => {
    const kernel = computeKernel(SAMPLE_RATE);
    const serialized = serializeKernel(kernel);
    const transferables = getTransferables(serialized);

    expect(transferables).toHaveLength(3);
    for (const t of transferables) {
      expect(t).toBeInstanceOf(ArrayBuffer);
    }
  });
});
