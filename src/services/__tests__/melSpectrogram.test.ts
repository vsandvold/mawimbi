import { vi } from 'vitest';
import { computeMelSpectrogram } from '../melSpectrogram';

const MEL_BANDS = 96;
const PATCH_SIZE = 128;

// Mock essentia.js WASM modules
const mockComputeFrameWise = vi.fn();

vi.mock('essentia.js/dist/essentia-wasm.es.js', () => ({
  default: vi.fn().mockResolvedValue({}),
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

describe('computeMelSpectrogram', () => {
  it('returns patches of 128 frames x 96 mel bands', async () => {
    const totalFrames = PATCH_SIZE * 2;
    const melSpectrum = new Float32Array(totalFrames * MEL_BANDS);
    melSpectrum.fill(0.001);

    mockComputeFrameWise.mockReturnValue({
      melSpectrum,
      melBandsSize: MEL_BANDS,
      patchSize: 187,
    });

    const patches = await computeMelSpectrogram(new Float32Array(16000));

    expect(patches).toHaveLength(2);
    expect(patches[0].length).toBe(PATCH_SIZE * MEL_BANDS);
    expect(patches[1].length).toBe(PATCH_SIZE * MEL_BANDS);
  });

  it('discards leftover frames that do not fill a complete patch', async () => {
    // 128 + 64 = 192 frames — only 1 full patch
    const totalFrames = PATCH_SIZE + 64;
    const melSpectrum = new Float32Array(totalFrames * MEL_BANDS);
    melSpectrum.fill(0.001);

    mockComputeFrameWise.mockReturnValue({
      melSpectrum,
      melBandsSize: MEL_BANDS,
      patchSize: 187,
    });

    const patches = await computeMelSpectrogram(new Float32Array(16000));

    expect(patches).toHaveLength(1);
  });

  it('returns empty array when audio is too short for one patch', async () => {
    const totalFrames = 64;
    const melSpectrum = new Float32Array(totalFrames * MEL_BANDS);

    mockComputeFrameWise.mockReturnValue({
      melSpectrum,
      melBandsSize: MEL_BANDS,
      patchSize: 187,
    });

    const patches = await computeMelSpectrogram(new Float32Array(1000));

    expect(patches).toHaveLength(0);
  });

  it('applies log compression: log10(1 + 10000 * x)', async () => {
    const totalFrames = PATCH_SIZE;
    const melSpectrum = new Float32Array(totalFrames * MEL_BANDS);
    const testValue = 0.05;
    melSpectrum.fill(testValue);

    mockComputeFrameWise.mockReturnValue({
      melSpectrum,
      melBandsSize: MEL_BANDS,
      patchSize: 187,
    });

    const patches = await computeMelSpectrogram(new Float32Array(16000));
    const expected = Math.log10(1 + 10000 * testValue);

    expect(patches[0][0]).toBeCloseTo(expected);
    expect(patches[0][MEL_BANDS - 1]).toBeCloseTo(expected);
  });

  it('passes audio to the extractor', async () => {
    const audio = new Float32Array([0.1, 0.2, 0.3]);
    const melSpectrum = new Float32Array(0);

    mockComputeFrameWise.mockReturnValue({
      melSpectrum,
      melBandsSize: MEL_BANDS,
      patchSize: 187,
    });

    await computeMelSpectrogram(audio);

    expect(mockComputeFrameWise).toHaveBeenCalledWith(audio);
  });
});
