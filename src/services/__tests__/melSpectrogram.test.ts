import { vi } from 'vitest';
import { computeMelSpectrogram } from '../melSpectrogram';

const MEL_BANDS = 96;
const PATCH_SIZE = 128;

// Mock essentia.js WASM modules
const mockComputeFrameWise = vi.fn();

vi.mock('essentia.js/dist/essentia-wasm.es.js', () => ({
  EssentiaWASM: {},
}));

vi.mock('essentia.js/dist/essentia.js-model.es.js', () => {
  class MockExtractor {
    computeFrameWise = mockComputeFrameWise;
  }
  return { EssentiaTFInputExtractor: MockExtractor };
});

beforeEach(() => {
  mockComputeFrameWise.mockReset();
});

// Builds a mock return value matching the real essentia.js computeFrameWise
// output: melSpectrum is an array of arrays (one array of MEL_BANDS values per
// frame), NOT a flat Float32Array.
function mockMelSpectrum(totalFrames: number, fillValue = 0.001) {
  const melSpectrum: Float32Array[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const frame = new Float32Array(MEL_BANDS);
    frame.fill(fillValue);
    melSpectrum.push(frame);
  }
  return { melSpectrum, melBandsSize: MEL_BANDS, patchSize: 187 };
}

describe('computeMelSpectrogram', () => {
  it('returns patches of 128 frames x 96 mel bands', async () => {
    const totalFrames = PATCH_SIZE * 2;
    mockComputeFrameWise.mockReturnValue(mockMelSpectrum(totalFrames));

    const patches = await computeMelSpectrogram(new Float32Array(16000));

    expect(patches).toHaveLength(2);
    expect(patches[0].length).toBe(PATCH_SIZE * MEL_BANDS);
    expect(patches[1].length).toBe(PATCH_SIZE * MEL_BANDS);
  });

  it('discards leftover frames that do not fill a complete patch', async () => {
    // 128 + 64 = 192 frames — only 1 full patch
    const totalFrames = PATCH_SIZE + 64;
    mockComputeFrameWise.mockReturnValue(mockMelSpectrum(totalFrames));

    const patches = await computeMelSpectrogram(new Float32Array(16000));

    expect(patches).toHaveLength(1);
  });

  it('returns empty array when audio is too short for one patch', async () => {
    mockComputeFrameWise.mockReturnValue(mockMelSpectrum(64));

    const patches = await computeMelSpectrogram(new Float32Array(1000));

    expect(patches).toHaveLength(0);
  });

  it('applies log compression: log10(1 + 10000 * x)', async () => {
    const testValue = 0.05;
    mockComputeFrameWise.mockReturnValue(
      mockMelSpectrum(PATCH_SIZE, testValue),
    );

    const patches = await computeMelSpectrogram(new Float32Array(16000));
    const expected = Math.log10(1 + 10000 * testValue);

    expect(patches[0][0]).toBeCloseTo(expected);
    expect(patches[0][MEL_BANDS - 1]).toBeCloseTo(expected);
  });

  it('passes audio to the extractor', async () => {
    const audio = new Float32Array([0.1, 0.2, 0.3]);
    mockComputeFrameWise.mockReturnValue(mockMelSpectrum(0));

    await computeMelSpectrogram(audio);

    expect(mockComputeFrameWise).toHaveBeenCalledWith(audio, 256);
  });
});
