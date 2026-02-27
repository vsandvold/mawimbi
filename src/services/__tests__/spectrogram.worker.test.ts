import { vi } from 'vitest';
import {
  analyseToFrames,
  createLogFrequencyMapping,
} from '../spectrogram.worker';

// OfflineAudioContext is not available in jsdom — mock it identically to OfflineAnalyser tests
const mockGetByteFrequencyData = vi.fn();
const mockStartRendering = vi.fn();
const mockSuspend = vi.fn();
const mockConnect = vi.fn();
const mockCopyToChannel = vi.fn();

const FREQUENCY_BIN_COUNT = 2048;

const mockAnalyser = {
  fftSize: 4096,
  frequencyBinCount: FREQUENCY_BIN_COUNT,
  smoothingTimeConstant: 0,
  minDecibels: -80,
  maxDecibels: -30,
  numberOfOutputs: 1,
  getByteFrequencyData: mockGetByteFrequencyData,
  connect: mockConnect,
};

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
    createAnalyser: vi.fn().mockReturnValue({ ...mockAnalyser }),
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

  it('connects buffer source to analyser and destination', async () => {
    const mockCtx = createMockOfflineContext();
    stubOfflineAudioContext(mockCtx);

    await analyseToFrames([new Float32Array(44100)], 44100, 44100);

    const bufferSource = mockCtx.createBufferSource.mock.results[0].value;
    expect(bufferSource.connect).toHaveBeenCalled();
    expect(bufferSource.start).toHaveBeenCalledWith(0);
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
});
