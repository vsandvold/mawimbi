import { vi } from 'vitest';
import { createLogFrequencyMapping } from '../logFrequencyMapping';
import { analyseToFrames } from '../spectrogram.worker';

// OfflineAudioContext is not available in jsdom — mock it identically to OfflineAnalyser tests
const mockStartRendering = vi.fn();
const mockSuspend = vi.fn();
const mockCopyToChannel = vi.fn();

const FREQUENCY_BIN_COUNT = 512;

function createMockAnalyser() {
  return {
    fftSize: 1024,
    frequencyBinCount: FREQUENCY_BIN_COUNT,
    smoothingTimeConstant: 0,
    minDecibels: -80,
    maxDecibels: -30,
    numberOfOutputs: 1,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
  };
}

function createMockBiquadFilter() {
  return {
    type: '' as BiquadFilterType,
    frequency: { value: 0 },
    connect: vi.fn(),
  };
}

const mockBufferSource = {
  buffer: null as AudioBuffer | null,
  connect: vi.fn(),
  start: vi.fn(),
};

const mockDestination = {};

type MockOfflineContext = {
  destination: typeof mockDestination;
  currentTime: number;
  createAnalyser: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createBuffer: ReturnType<typeof vi.fn>;
  startRendering: typeof mockStartRendering;
  suspend: typeof mockSuspend;
  resume: ReturnType<typeof vi.fn>;
};

function createMockOfflineContext(): MockOfflineContext {
  return {
    destination: mockDestination,
    currentTime: 0,
    createAnalyser: vi.fn().mockImplementation(() => createMockAnalyser()),
    createBiquadFilter: vi
      .fn()
      .mockImplementation(() => createMockBiquadFilter()),
    createBufferSource: vi.fn().mockReturnValue({ ...mockBufferSource }),
    createBuffer: vi.fn().mockReturnValue({
      copyToChannel: mockCopyToChannel,
    }),
    startRendering: mockStartRendering,
    suspend: mockSuspend.mockReturnValue(Promise.resolve()),
    resume: vi.fn(),
  };
}

function stubOfflineAudioContext(ctx: MockOfflineContext) {
  vi.stubGlobal(
    'OfflineAudioContext',
    vi.fn().mockImplementation(function () {
      return ctx;
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStartRendering.mockResolvedValue({} as AudioBuffer);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createLogFrequencyMapping', () => {
  it('produces a mapping array with length equal to frequencyBinCount', () => {
    const mapping = createLogFrequencyMapping(FREQUENCY_BIN_COUNT);

    expect(mapping.length).toBe(FREQUENCY_BIN_COUNT);
  });

  it('produces mapping entries that are arrays of at least one index', () => {
    const mapping = createLogFrequencyMapping(FREQUENCY_BIN_COUNT);

    for (const entry of mapping) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has higher bins mapping to more entries than lower bins', () => {
    const mapping = createLogFrequencyMapping(FREQUENCY_BIN_COUNT);

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

describe('analyseToFrames', () => {
  it('returns SpectrogramData with correct metadata', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const channelData = [new Float32Array(length)];

    const result = await analyseToFrames(channelData, sampleRate, length);

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBeCloseTo(0.1, 2);
    expect(result.frequencyBinCount).toBe(FREQUENCY_BIN_COUNT);
    expect(result.timeResolution).toBe(0.025);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
  });

  it('creates an OfflineAudioContext with correct parameters', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    const channelData = [new Float32Array(44100)];
    await analyseToFrames(channelData, 44100, 44100);

    expect(OfflineAudioContext).toHaveBeenCalledWith(1, 44100, 44100);
  });

  it('creates a multi-channel context for multi-channel input', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    const channelData = [new Float32Array(1024), new Float32Array(1024)];
    await analyseToFrames(channelData, 44100, 1024);

    expect(OfflineAudioContext).toHaveBeenCalledWith(2, 1024, 44100);
  });

  it('creates an AudioBuffer and copies channel data into it', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    const ch0 = new Float32Array([0.1, 0.2]);
    const ch1 = new Float32Array([0.3, 0.4]);
    await analyseToFrames([ch0, ch1], 44100, 2);

    expect(mockCtx.createBuffer).toHaveBeenCalledWith(2, 2, 44100);
    expect(mockCopyToChannel).toHaveBeenCalledWith(ch0, 0);
    expect(mockCopyToChannel).toHaveBeenCalledWith(ch1, 1);
  });

  it('creates dual-band filters at 752 Hz', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    expect(mockCtx.createBiquadFilter).toHaveBeenCalledTimes(2);
    const filters = mockCtx.createBiquadFilter.mock.results.map(
      (r) => r.value as ReturnType<typeof createMockBiquadFilter>,
    );
    expect(filters[0].type).toBe('lowpass');
    expect(filters[0].frequency.value).toBe(752);
    expect(filters[1].type).toBe('highpass');
    expect(filters[1].frequency.value).toBe(752);
  });

  it('creates two analysers for dual-band processing', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    expect(mockCtx.createAnalyser).toHaveBeenCalledTimes(2);
  });

  it('connects buffer source through filters to analysers and destination', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    const bufferSource = mockCtx.createBufferSource.mock.results[0].value;
    // Buffer source connects to both filters
    expect(bufferSource.connect).toHaveBeenCalledTimes(2);
    expect(bufferSource.start).toHaveBeenCalledWith(0);

    // Each filter connects to its analyser
    const filters = mockCtx.createBiquadFilter.mock.results.map(
      (r) => r.value as ReturnType<typeof createMockBiquadFilter>,
    );
    expect(filters[0].connect).toHaveBeenCalledTimes(1);
    expect(filters[1].connect).toHaveBeenCalledTimes(1);

    // Each analyser connects to destination
    const analysers = mockCtx.createAnalyser.mock.results.map(
      (r) => r.value as ReturnType<typeof createMockAnalyser>,
    );
    expect(analysers[0].connect).toHaveBeenCalledTimes(1);
    expect(analysers[1].connect).toHaveBeenCalledTimes(1);
  });

  it('reads frequency data from both analysers during frame collection', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    await analyseToFrames([new Float32Array(length)], sampleRate, length);

    // 3 suspend points → 3 frames → each reads from both analysers
    const analysers = mockCtx.createAnalyser.mock.results.map(
      (r) => r.value as ReturnType<typeof createMockAnalyser>,
    );
    expect(analysers[0].getByteFrequencyData).toHaveBeenCalledTimes(3);
    expect(analysers[1].getByteFrequencyData).toHaveBeenCalledTimes(3);
  });

  it('suspends at regular intervals for frame collection', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    // 100ms duration → suspend at 25ms, 50ms, 75ms → 3 suspend calls
    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    await analyseToFrames([new Float32Array(length)], sampleRate, length);

    expect(mockCtx.suspend).toHaveBeenCalledTimes(3);
  });

  it('collects one frequency frame per suspend point', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

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
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const result = await analyseToFrames(
      [new Float32Array(length)],
      sampleRate,
      length,
    );

    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(FREQUENCY_BIN_COUNT);
    }

    if (result.frequencyFrames.length >= 2) {
      expect(result.frequencyFrames[0]).not.toBe(result.frequencyFrames[1]);
    }
  });

  it('calls startRendering to begin offline processing', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    expect(mockCtx.startRendering).toHaveBeenCalledOnce();
  });

  it('merges low-frequency bins from lowpass and high-frequency bins from highpass', async () => {
    const mockCtx = createMockOfflineContext();

    // At 44100 Hz with FFT_SIZE=1024, splitBin = round(752 / (44100/1024)) ≈ 17
    const sampleRate = 44100;
    const splitBin = Math.round(752 / (sampleRate / 1024));

    let analyserIndex = 0;
    mockCtx.createAnalyser = vi.fn().mockImplementation(() => {
      const LOW_VALUE = 100;
      const HIGH_VALUE = 200;
      const fillValue = analyserIndex === 0 ? LOW_VALUE : HIGH_VALUE;
      analyserIndex++;
      return {
        fftSize: 1024,
        frequencyBinCount: FREQUENCY_BIN_COUNT,
        smoothingTimeConstant: 0,
        minDecibels: -80,
        maxDecibels: -30,
        numberOfOutputs: 1,
        getByteFrequencyData: vi.fn().mockImplementation((arr: Uint8Array) => {
          arr.fill(fillValue);
        }),
        connect: vi.fn(),
      };
    });
    stubOfflineAudioContext(mockCtx);

    const length = Math.ceil(0.05 * sampleRate);
    const result = await analyseToFrames(
      [new Float32Array(length)],
      sampleRate,
      length,
    );

    // The first frame should have low-band values (100) before splitBin
    // and high-band values (200) at and after splitBin, before log mapping
    // After log mapping, bin 0 maps 1:1, so it should retain its input value
    const frame = result.frequencyFrames[0];
    expect(frame).toBeDefined();

    // Bin 0 maps to linear bin 0 (1:1 in log mapping) → should be 100 (low band)
    expect(frame[0]).toBe(100);

    // The last output bin maps to the highest linear bins → should reflect high-band value
    // Due to log mapping pooling, the exact value depends on the mapping,
    // but it should be non-zero (high band has data)
    expect(frame[FREQUENCY_BIN_COUNT - 1]).toBeGreaterThan(0);

    // Verify split bin boundary: output bins that map exclusively to linear bins
    // below splitBin should come from the low band (100)
    const logMapping = createLogFrequencyMapping(FREQUENCY_BIN_COUNT);
    const firstHighOutputBin = logMapping.findIndex((pool) =>
      pool.some((idx) => idx >= splitBin),
    );
    // Output bins before firstHighOutputBin map only to low-band linear bins
    if (firstHighOutputBin > 0) {
      expect(frame[firstHighOutputBin - 1]).toBe(100);
    }
  });
});
