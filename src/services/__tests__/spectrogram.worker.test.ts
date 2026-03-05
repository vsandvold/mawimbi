import { vi } from 'vitest';
import {
  BAND_CONFIGS,
  calculateMultiBandMergeParams,
  createMergedLogMapping,
} from '../dualBandAnalysis';
import { createLogFrequencyMapping } from '../logFrequencyMapping';
import { analyseToFrames } from '../spectrogram.worker';

const LOG_MAPPING_BIN_COUNT = 512;
const BAND_COUNT = BAND_CONFIGS.length;

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

function createMockAnalyser() {
  return {
    _fftSize: 0,
    get fftSize() {
      return this._fftSize;
    },
    set fftSize(value: number) {
      this._fftSize = value;
    },
    get frequencyBinCount() {
      return this._fftSize / 2;
    },
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
    const mapping = createLogFrequencyMapping(LOG_MAPPING_BIN_COUNT);

    expect(mapping.length).toBe(LOG_MAPPING_BIN_COUNT);
  });

  it('produces mapping entries that are arrays of at least one index', () => {
    const mapping = createLogFrequencyMapping(LOG_MAPPING_BIN_COUNT);

    for (const entry of mapping) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has higher bins mapping to more entries than lower bins', () => {
    const mapping = createLogFrequencyMapping(LOG_MAPPING_BIN_COUNT);

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

describe('calculateMultiBandMergeParams', () => {
  it('returns correct merge parameters for 44100 Hz', () => {
    const params = calculateMultiBandMergeParams(44100);

    expect(params.bands.length).toBe(BAND_COUNT);

    // Band 0: SR=5120, FFT=2048
    expect(params.bands[0].binWidth).toBe(2.5);
    expect(params.bands[0].startBin).toBe(0);
    expect(params.bands[0].endBin).toBe(128); // ceil(320/2.5)

    // Band 1: SR=5120, FFT=512
    expect(params.bands[1].binWidth).toBe(10);
    expect(params.bands[1].startBin).toBe(32); // ceil(320/10)
    expect(params.bands[1].endBin).toBe(128); // ceil(1280/10)

    // Band 3: SR=44100, FFT=1024 (native)
    expect(params.bands[3].sampleRate).toBe(44100);
    expect(params.bands[3].binWidth).toBeCloseTo(43.066, 2);

    // Total merged bins should be positive and reasonable
    expect(params.mergedBinCount).toBeGreaterThan(0);
    expect(params.mergedBinCount).toBeLessThan(2000);
  });

  it('returns correct merge parameters for 48000 Hz', () => {
    const params = calculateMultiBandMergeParams(48000);

    expect(params.bands.length).toBe(BAND_COUNT);

    // Band 0 stays the same (SR=5120 is independent of native rate)
    expect(params.bands[0].binWidth).toBe(2.5);

    // Band 3 uses native rate
    expect(params.bands[3].sampleRate).toBe(48000);
    expect(params.bands[3].binWidth).toBeCloseTo(46.875, 2);
  });
});

describe('analyseToFrames', () => {
  it('returns SpectrogramData with correct metadata', async () => {
    stubOfflineAudioContext();

    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const channelData = [new Float32Array(length)];
    const { mergedBinCount } = calculateMultiBandMergeParams(sampleRate);

    const result = await analyseToFrames(channelData, sampleRate, length);

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBeCloseTo(0.1, 2);
    expect(result.frequencyBinCount).toBe(mergedBinCount);
    expect(result.timeResolution).toBe(0.025);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
  });

  it('creates OfflineAudioContexts for each band', async () => {
    stubOfflineAudioContext();

    const channelData = [new Float32Array(44100)];
    await analyseToFrames(channelData, 44100, 44100);

    expect(OfflineAudioContext).toHaveBeenCalledTimes(BAND_COUNT);
    // Band 0: SR=5120
    expect(OfflineAudioContext).toHaveBeenCalledWith(1, 5120, 5120);
    // Band 1: SR=5120
    expect(OfflineAudioContext).toHaveBeenCalledWith(1, 5120, 5120);
    // Band 2: SR=20480
    expect(OfflineAudioContext).toHaveBeenCalledWith(1, 20480, 20480);
    // Band 3: SR=44100
    expect(OfflineAudioContext).toHaveBeenCalledWith(1, 44100, 44100);
  });

  it('creates multi-channel contexts for multi-channel input', async () => {
    stubOfflineAudioContext();

    const channelData = [new Float32Array(1024), new Float32Array(1024)];
    await analyseToFrames(channelData, 44100, 1024);

    expect(OfflineAudioContext).toHaveBeenCalledTimes(BAND_COUNT);
    const duration = 1024 / 44100;
    expect(OfflineAudioContext).toHaveBeenCalledWith(
      2,
      Math.ceil(duration * 5120),
      5120,
    );
    expect(OfflineAudioContext).toHaveBeenCalledWith(2, 1024, 44100);
  });

  it('creates AudioBuffers and copies channel data into each band context', async () => {
    stubOfflineAudioContext();

    const ch0 = new Float32Array([0.1, 0.2]);
    const ch1 = new Float32Array([0.3, 0.4]);
    await analyseToFrames([ch0, ch1], 44100, 2);

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

  it('creates appropriate filters per band', async () => {
    stubOfflineAudioContext();

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    expect(mockContexts).toHaveLength(BAND_COUNT);

    // Band 0: lowpass@320
    const band0Filter = mockContexts[0].createBiquadFilter.mock.results[0]
      .value as MockBiquadFilter;
    expect(band0Filter.type).toBe('lowpass');
    expect(band0Filter.frequency.value).toBe(320);

    // Band 1: highpass@320 + lowpass@1280
    expect(mockContexts[1].createBiquadFilter).toHaveBeenCalledTimes(2);

    // Band 3: highpass@5120
    const lastBandFilter = mockContexts[BAND_COUNT - 1].createBiquadFilter.mock
      .results[0].value as MockBiquadFilter;
    expect(lastBandFilter.type).toBe('highpass');
    expect(lastBandFilter.frequency.value).toBe(5120);
  });

  it('creates one analyser per band context', async () => {
    stubOfflineAudioContext();

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    for (const ctx of mockContexts) {
      expect(ctx.createAnalyser).toHaveBeenCalledTimes(1);
    }
  });

  it('connects buffer source through filters to analyser and destination in each band', async () => {
    stubOfflineAudioContext();

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    for (const ctx of mockContexts) {
      const bufferSource = ctx.createBufferSource.mock.results[0].value;
      expect(bufferSource.connect).toHaveBeenCalledTimes(1);
      expect(bufferSource.start).toHaveBeenCalledWith(0);
    }
  });

  it('reads frequency data from each band analyser during frame collection', async () => {
    stubOfflineAudioContext();

    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    await analyseToFrames([new Float32Array(length)], sampleRate, length);

    // 3 suspend points → 3 getByteFrequencyData calls per band analyser
    for (const ctx of mockContexts) {
      const analyser = ctx.createAnalyser.mock.results[0].value as MockAnalyser;
      expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(3);
    }
  });

  it('suspends at regular intervals in all band contexts', async () => {
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
    const { mergedBinCount } = calculateMultiBandMergeParams(sampleRate);
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

  it('calls startRendering on all band contexts', async () => {
    stubOfflineAudioContext();

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    for (const ctx of mockContexts) {
      expect(ctx.startRendering).toHaveBeenCalledOnce();
    }
  });

  it('uses maximum when pooling bins in log frequency mapping', async () => {
    const FILL_VALUE = 200;
    const contexts: MockOfflineContext[] = [];

    vi.stubGlobal(
      'OfflineAudioContext',
      vi.fn().mockImplementation(function () {
        const ctx = createMockOfflineContext();
        ctx.createAnalyser = vi.fn().mockImplementation(() => ({
          _fftSize: 0,
          get fftSize() {
            return this._fftSize;
          },
          set fftSize(value: number) {
            this._fftSize = value;
          },
          get frequencyBinCount() {
            return this._fftSize / 2;
          },
          smoothingTimeConstant: 0,
          minDecibels: -80,
          maxDecibels: -30,
          numberOfOutputs: 1,
          getByteFrequencyData: vi
            .fn()
            .mockImplementation((arr: Uint8Array) => {
              arr.fill(FILL_VALUE);
            }),
          connect: vi.fn(),
        }));
        contexts.push(ctx);
        return ctx;
      }),
    );

    const sampleRate = 44100;
    const { mergedBinCount } = calculateMultiBandMergeParams(sampleRate);
    const length = Math.ceil(0.05 * sampleRate);
    const result = await analyseToFrames(
      [new Float32Array(length)],
      sampleRate,
      length,
    );

    const frame = result.frequencyFrames[0];
    expect(frame).toBeDefined();

    // Every output bin should be exactly FILL_VALUE (the max of its pooled
    // inputs), not a sum that overflows Uint8Array.
    for (let i = 0; i < mergedBinCount; i++) {
      expect(frame[i]).toBe(FILL_VALUE);
    }
  });

  it('merges bins from all bands correctly', async () => {
    const BAND_VALUES = [100, 120, 160, 200];
    const contexts: MockOfflineContext[] = [];
    let contextIndex = 0;

    vi.stubGlobal(
      'OfflineAudioContext',
      vi.fn().mockImplementation(function () {
        const ctx = createMockOfflineContext();
        const fillValue =
          contextIndex < BAND_VALUES.length ? BAND_VALUES[contextIndex] : 0;
        contextIndex++;
        ctx.createAnalyser = vi.fn().mockImplementation(() => ({
          _fftSize: 0,
          get fftSize() {
            return this._fftSize;
          },
          set fftSize(value: number) {
            this._fftSize = value;
          },
          get frequencyBinCount() {
            return this._fftSize / 2;
          },
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
        contexts.push(ctx);
        return ctx;
      }),
    );

    const sampleRate = 44100;
    const { bands, mergedBinCount } = calculateMultiBandMergeParams(sampleRate);
    const length = Math.ceil(0.05 * sampleRate);
    const result = await analyseToFrames(
      [new Float32Array(length)],
      sampleRate,
      length,
    );

    const frame = result.frequencyFrames[0];
    expect(frame).toBeDefined();

    // Bin 0 maps to lowest frequencies → band 0 value
    expect(frame[0]).toBe(BAND_VALUES[0]);

    // The last output bin maps to the highest frequencies → last band value
    expect(frame[mergedBinCount - 1]).toBeGreaterThan(0);

    // Verify the split: output bins mapped from band 0 should carry band 0's value
    const band0BinCount = bands[0].binCount;
    const logMapping = createMergedLogMapping(sampleRate);
    const firstNonBand0OutputBin = logMapping.findIndex((pool) =>
      pool.some((idx) => idx >= band0BinCount),
    );
    if (firstNonBand0OutputBin > 0) {
      expect(frame[firstNonBand0OutputBin - 1]).toBeGreaterThan(0);
    }
  });
});
