import { vi } from 'vitest';
import { createLogFrequencyMapping } from '../logFrequencyMapping';
import { analyseToFrames, calculateMergeParams } from '../spectrogram.worker';

const FFT_BIN_COUNT = 512; // DUAL_BAND_FFT_SIZE / 2

type MockAnalyser = {
  fftSize: number;
  frequencyBinCount: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
  numberOfOutputs: number;
  getByteFrequencyData: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
};

function createMockAnalyser(): MockAnalyser {
  return {
    fftSize: 1024,
    frequencyBinCount: FFT_BIN_COUNT,
    smoothingTimeConstant: 0,
    minDecibels: -80,
    maxDecibels: -30,
    numberOfOutputs: 1,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
  };
}

type MockBiquadFilter = {
  type: BiquadFilterType;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
};

function createMockBiquadFilter(): MockBiquadFilter {
  return {
    type: '' as BiquadFilterType,
    frequency: { value: 0 },
    connect: vi.fn(),
  };
}

type MockOfflineContext = {
  destination: object;
  currentTime: number;
  createAnalyser: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createBuffer: ReturnType<typeof vi.fn>;
  startRendering: ReturnType<typeof vi.fn>;
  suspend: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
};

function createMockOfflineContext(): MockOfflineContext {
  return {
    destination: {},
    currentTime: 0,
    createAnalyser: vi.fn().mockImplementation(() => createMockAnalyser()),
    createBiquadFilter: vi
      .fn()
      .mockImplementation(() => createMockBiquadFilter()),
    createBufferSource: vi.fn().mockReturnValue({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: vi.fn(),
    }),
    createBuffer: vi.fn().mockReturnValue({
      copyToChannel: vi.fn(),
    }),
    startRendering: vi.fn().mockResolvedValue({} as AudioBuffer),
    suspend: vi.fn().mockReturnValue(Promise.resolve()),
    resume: vi.fn(),
  };
}

let mockContexts: MockOfflineContext[];

function stubOfflineAudioContext() {
  mockContexts = [];
  vi.stubGlobal(
    'OfflineAudioContext',
    vi.fn().mockImplementation(function () {
      const ctx = createMockOfflineContext();
      mockContexts.push(ctx);
      return ctx;
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createLogFrequencyMapping', () => {
  it('produces a mapping array with length equal to frequencyBinCount', () => {
    const mapping = createLogFrequencyMapping(FFT_BIN_COUNT);

    expect(mapping.length).toBe(FFT_BIN_COUNT);
  });

  it('produces mapping entries that are arrays of at least one index', () => {
    const mapping = createLogFrequencyMapping(FFT_BIN_COUNT);

    for (const entry of mapping) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has higher bins mapping to more entries than lower bins', () => {
    const mapping = createLogFrequencyMapping(FFT_BIN_COUNT);

    const lastBinPoolSize = mapping[mapping.length - 1].length;
    const firstBinPoolSize = mapping[0].length;

    expect(lastBinPoolSize).toBeGreaterThanOrEqual(firstBinPoolSize);
  });

  it('produces consistent results for the same input', () => {
    const mapping1 = createLogFrequencyMapping(512);
    const mapping2 = createLogFrequencyMapping(512);

    expect(mapping1).toEqual(mapping2);
  });

  it('handles small bin counts', () => {
    const mapping = createLogFrequencyMapping(4);

    expect(mapping.length).toBe(4);
    for (const entry of mapping) {
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('calculateMergeParams', () => {
  it('returns correct merge parameters for 44100 Hz', () => {
    const params = calculateMergeParams(44100);

    expect(params.lowBinCount).toBe(257);
    expect(params.highBinStart).toBe(18);
    expect(params.highBinEnd).toBe(512);
    expect(params.mergedBinCount).toBe(751);
  });

  it('returns correct merge parameters for 48000 Hz', () => {
    const params = calculateMergeParams(48000);

    expect(params.lowBinCount).toBe(257);
    expect(params.highBinStart).toBe(17);
    expect(params.highBinEnd).toBe(512);
    expect(params.mergedBinCount).toBe(752);
  });
});

describe('analyseToFrames', () => {
  it('returns SpectrogramData with correct metadata', async () => {
    stubOfflineAudioContext();

    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const channelData = [new Float32Array(length)];
    const { mergedBinCount } = calculateMergeParams(sampleRate);

    const result = await analyseToFrames(channelData, sampleRate, length);

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBeCloseTo(0.1, 2);
    expect(result.frequencyBinCount).toBe(mergedBinCount);
    expect(result.timeResolution).toBe(0.025);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
  });

  it('creates two OfflineAudioContexts with correct parameters', async () => {
    stubOfflineAudioContext();

    const channelData = [new Float32Array(44100)];
    await analyseToFrames(channelData, 44100, 44100);

    expect(OfflineAudioContext).toHaveBeenCalledTimes(2);
    // Low band: 1 channel, 3000 samples (1s × 3000 Hz), 3000 Hz
    expect(OfflineAudioContext).toHaveBeenCalledWith(1, 3000, 3000);
    // High band: 1 channel, 44100 samples (1s × 44100 Hz), 44100 Hz
    expect(OfflineAudioContext).toHaveBeenCalledWith(1, 44100, 44100);
  });

  it('creates multi-channel contexts for multi-channel input', async () => {
    stubOfflineAudioContext();

    const channelData = [new Float32Array(1024), new Float32Array(1024)];
    await analyseToFrames(channelData, 44100, 1024);

    expect(OfflineAudioContext).toHaveBeenCalledTimes(2);
    // duration = 1024/44100 ≈ 0.0232s, low band length = ceil(0.0232 * 3000) = 70
    expect(OfflineAudioContext).toHaveBeenCalledWith(2, 70, 3000);
    expect(OfflineAudioContext).toHaveBeenCalledWith(2, 1024, 44100);
  });

  it('creates AudioBuffers and copies channel data into each band context', async () => {
    stubOfflineAudioContext();

    const ch0 = new Float32Array([0.1, 0.2]);
    const ch1 = new Float32Array([0.3, 0.4]);
    await analyseToFrames([ch0, ch1], 44100, 2);

    // Each band context creates a buffer at the original sample rate
    for (const ctx of mockContexts) {
      expect(ctx.createBuffer).toHaveBeenCalledWith(2, 2, 44100);
      const buffer = ctx.createBuffer.mock.results[0].value;
      expect(buffer.copyToChannel).toHaveBeenCalledWith(
        expect.any(Float32Array),
        0,
      );
      expect(buffer.copyToChannel).toHaveBeenCalledWith(
        expect.any(Float32Array),
        1,
      );
    }
  });

  it('creates a lowpass filter in low band and highpass filter in high band', async () => {
    stubOfflineAudioContext();

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    expect(mockContexts).toHaveLength(2);

    // Low band context: one lowpass filter at 752 Hz
    const lowFilter = mockContexts[0].createBiquadFilter.mock.results[0]
      .value as MockBiquadFilter;
    expect(lowFilter.type).toBe('lowpass');
    expect(lowFilter.frequency.value).toBe(752);

    // High band context: one highpass filter at 752 Hz
    const highFilter = mockContexts[1].createBiquadFilter.mock.results[0]
      .value as MockBiquadFilter;
    expect(highFilter.type).toBe('highpass');
    expect(highFilter.frequency.value).toBe(752);
  });

  it('creates one analyser per band context', async () => {
    stubOfflineAudioContext();

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    for (const ctx of mockContexts) {
      expect(ctx.createAnalyser).toHaveBeenCalledTimes(1);
    }
  });

  it('connects buffer source through filter to analyser and destination in each band', async () => {
    stubOfflineAudioContext();

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    for (const ctx of mockContexts) {
      const bufferSource = ctx.createBufferSource.mock.results[0].value;
      expect(bufferSource.connect).toHaveBeenCalledTimes(1);
      expect(bufferSource.start).toHaveBeenCalledWith(0);

      const filter = ctx.createBiquadFilter.mock.results[0]
        .value as MockBiquadFilter;
      expect(filter.connect).toHaveBeenCalledTimes(1);

      const analyser = ctx.createAnalyser.mock.results[0].value as MockAnalyser;
      expect(analyser.connect).toHaveBeenCalledTimes(1);
    }
  });

  it('reads frequency data from each band analyser during frame collection', async () => {
    stubOfflineAudioContext();

    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    await analyseToFrames([new Float32Array(length)], sampleRate, length);

    // 3 suspend points → 3 frames per band
    for (const ctx of mockContexts) {
      const analyser = ctx.createAnalyser.mock.results[0].value as MockAnalyser;
      expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(3);
    }
  });

  it('suspends at regular intervals in both band contexts', async () => {
    stubOfflineAudioContext();

    // 100ms duration → suspend at 25ms, 50ms, 75ms → 3 suspend calls
    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    await analyseToFrames([new Float32Array(length)], sampleRate, length);

    for (const ctx of mockContexts) {
      expect(ctx.suspend).toHaveBeenCalledTimes(3);
    }
  });

  it('collects one frequency frame per suspend point', async () => {
    stubOfflineAudioContext();

    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const result = await analyseToFrames(
      [new Float32Array(length)],
      sampleRate,
      length,
    );

    // 100ms at 25ms intervals → 3 frames (25ms, 50ms, 75ms)
    expect(result.frequencyFrames.length).toBe(3);
  });

  it('stores each frame as an independent Uint8Array', async () => {
    stubOfflineAudioContext();

    const sampleRate = 44100;
    const { mergedBinCount } = calculateMergeParams(sampleRate);
    const length = Math.ceil(0.1 * sampleRate);
    const result = await analyseToFrames(
      [new Float32Array(length)],
      sampleRate,
      length,
    );

    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(mergedBinCount);
    }

    if (result.frequencyFrames.length >= 2) {
      expect(result.frequencyFrames[0]).not.toBe(result.frequencyFrames[1]);
    }
  });

  it('calls startRendering on both band contexts', async () => {
    stubOfflineAudioContext();

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    for (const ctx of mockContexts) {
      expect(ctx.startRendering).toHaveBeenCalledOnce();
    }
  });

  it('merges low-frequency bins from lowpass and high-frequency bins from highpass', async () => {
    // Use value 1 for low band to avoid Uint8Array overflow when log-mapping
    // pools multiple bins (poolSize × value must stay ≤ 255)
    const LOW_VALUE = 1;
    const HIGH_VALUE = 2;
    let contextIndex = 0;

    vi.stubGlobal(
      'OfflineAudioContext',
      vi.fn().mockImplementation(function () {
        const ctx = createMockOfflineContext();
        const fillValue = contextIndex === 0 ? LOW_VALUE : HIGH_VALUE;
        contextIndex++;
        ctx.createAnalyser = vi.fn().mockImplementation(() => ({
          fftSize: 1024,
          frequencyBinCount: FFT_BIN_COUNT,
          smoothingTimeConstant: 0,
          minDecibels: -80,
          maxDecibels: -30,
          numberOfOutputs: 1,
          getByteFrequencyData: vi
            .fn()
            .mockImplementation((arr: Uint8Array) => {
              arr.fill(fillValue);
            }),
          connect: vi.fn(),
        }));
        return ctx;
      }),
    );

    const sampleRate = 44100;
    const { lowBinCount, mergedBinCount } = calculateMergeParams(sampleRate);
    const length = Math.ceil(0.05 * sampleRate);
    const result = await analyseToFrames(
      [new Float32Array(length)],
      sampleRate,
      length,
    );

    const frame = result.frequencyFrames[0];
    expect(frame).toBeDefined();

    // Bin 0 maps to linear bin 0 (1:1 in log mapping) → low band value
    expect(frame[0]).toBe(LOW_VALUE);

    // The last output bin maps to the highest linear bins → high band value
    expect(frame[mergedBinCount - 1]).toBeGreaterThan(0);

    // Verify the split: output bins mapped entirely from the low band
    // should be non-zero (sum of LOW_VALUE=1 per pooled bin)
    const logMapping = createLogFrequencyMapping(mergedBinCount);
    const firstHighOutputBin = logMapping.findIndex((pool) =>
      pool.some((idx) => idx >= lowBinCount),
    );
    if (firstHighOutputBin > 0) {
      expect(frame[firstHighOutputBin - 1]).toBeGreaterThan(0);
    }
  });
});
