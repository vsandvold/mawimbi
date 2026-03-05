import { vi } from 'vitest';
import { computeNumberBins, HOP_SECONDS } from '../CQTAnalyser';
import OfflineAnalyser, { type SpectrogramData } from '../OfflineAnalyser';

// OfflineAudioContext is not available in jsdom, so we need a thorough mock
const mockGetByteFrequencyData = vi.fn();
const mockStartRendering = vi.fn();
const mockSuspend = vi.fn();
const mockResume = vi.fn();
const mockConnect = vi.fn();

function createMockAnalyserNode() {
  return {
    _fftSize: 4096,
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
    getByteFrequencyData: mockGetByteFrequencyData,
    connect: mockConnect,
  };
}

const mockBufferSource = {
  buffer: null as AudioBuffer | null,
  connect: vi.fn(),
  start: vi.fn(),
};

const mockScriptProcessor = {
  onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
  connect: vi.fn(),
};

const mockDestination = {};

type MockOfflineContext = {
  destination: typeof mockDestination;
  currentTime: number;
  createAnalyser: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createScriptProcessor: ReturnType<typeof vi.fn>;
  startRendering: typeof mockStartRendering;
  suspend?: typeof mockSuspend;
  resume?: typeof mockResume;
};

function createMockOfflineContext(
  supportsSuspend: boolean,
): MockOfflineContext {
  const ctx: MockOfflineContext = {
    destination: mockDestination,
    currentTime: 0,
    createAnalyser: vi.fn().mockImplementation(() => createMockAnalyserNode()),
    createBufferSource: vi.fn().mockReturnValue({ ...mockBufferSource }),
    createScriptProcessor: vi.fn().mockReturnValue({ ...mockScriptProcessor }),
    startRendering: mockStartRendering,
  };
  if (supportsSuspend) {
    ctx.suspend = mockSuspend.mockReturnValue(Promise.resolve());
    ctx.resume = mockResume;
  }
  return ctx;
}

let savedOfflineAudioContext: typeof window.OfflineAudioContext;

function stubOfflineAudioContext(ctx: MockOfflineContext) {
  // Must be a regular function (not arrow) to support `new` in Vitest v4
  vi.stubGlobal(
    'OfflineAudioContext',
    vi.fn().mockImplementation(function () {
      return ctx;
    }),
  );
}

beforeAll(() => {
  savedOfflineAudioContext = window.OfflineAudioContext;
});

afterAll(() => {
  vi.stubGlobal('OfflineAudioContext', savedOfflineAudioContext);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockStartRendering.mockResolvedValue({} as AudioBuffer);
});

function createAudioBuffer(
  duration: number,
  sampleRate = 44100,
  channels = 1,
): AudioBuffer {
  const length = Math.ceil(duration * sampleRate);
  return {
    duration,
    length,
    sampleRate,
    numberOfChannels: channels,
    getChannelData: vi.fn().mockReturnValue(new Float32Array(length)),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

type OfflineAnalyserInternals = {
  logFrequencyMapping: number[][];
};

// CQT bin count for 44100 Hz sample rate
const CQT_BIN_COUNT = computeNumberBins(44100);

describe('constructor', () => {
  it('creates an OfflineAudioContext with correct parameters', () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(2.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    expect(window.OfflineAudioContext).toHaveBeenCalledWith(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate,
    );
    expect(analyser.frequencyBinCount).toBe(2048);
  });

  it('sets time resolution to suspend interval when suspend is supported', () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const analyser = new OfflineAnalyser(createAudioBuffer(1.0));

    expect(analyser.timeResolution).toBe(0.025);
  });

  it('sets time resolution based on script processor when suspend is not supported', () => {
    const mockCtx = createMockOfflineContext(false);
    stubOfflineAudioContext(mockCtx);

    const sampleRate = 44100;
    const analyser = new OfflineAnalyser(createAudioBuffer(1.0, sampleRate));

    expect(analyser.timeResolution).toBeCloseTo(1024 / sampleRate, 5);
  });
});

describe('getFrequencyData (suspend context)', () => {
  it('suspends at regular intervals and collects frequency data', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.1); // 100ms = 4 suspend points at 25ms intervals
    const analyser = new OfflineAnalyser(audioBuffer);

    const callback = vi.fn();
    await analyser.getFrequencyData(callback);

    // Should have called suspend for each step
    expect(mockCtx.suspend).toHaveBeenCalled();
    // Should have started rendering
    expect(mockCtx.startRendering).toHaveBeenCalled();
  });

  it('connects buffer source to analyser and destination', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.05);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.getFrequencyData(vi.fn());

    const bufferSource = mockCtx.createBufferSource.mock.results[0].value;
    expect(bufferSource.connect).toHaveBeenCalled();
    expect(bufferSource.start).toHaveBeenCalledWith(0);
    expect(bufferSource.buffer).toBe(audioBuffer);
  });
});

describe('getFrequencyData (script processor fallback)', () => {
  it('creates a script processor when suspend is not supported', async () => {
    const mockCtx = createMockOfflineContext(false);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.getFrequencyData(vi.fn());

    expect(mockCtx.createScriptProcessor).toHaveBeenCalledWith(
      1024,
      expect.any(Number),
      expect.any(Number),
    );
    expect(mockCtx.startRendering).toHaveBeenCalled();
  });

  it('sets up onaudioprocess callback', async () => {
    const mockCtx = createMockOfflineContext(false);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.getFrequencyData(vi.fn());

    const scriptProcessor = mockCtx.createScriptProcessor.mock.results[0].value;
    expect(scriptProcessor.onaudioprocess).toBeTypeOf('function');
  });
});

describe('getLogarithmicFrequencyData', () => {
  it('wraps getFrequencyData with a logarithmic transform', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.05);
    const analyser = new OfflineAnalyser(audioBuffer);

    const getFreqSpy = vi.spyOn(analyser, 'getFrequencyData');
    const callback = vi.fn();

    await analyser.getLogarithmicFrequencyData(callback);

    expect(getFreqSpy).toHaveBeenCalledTimes(1);
    // The inner callback wraps user callback with transform
    expect(getFreqSpy).toHaveBeenCalledWith(expect.any(Function));
  });

  it('calls startRendering', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.05);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.getLogarithmicFrequencyData(vi.fn());

    expect(mockCtx.startRendering).toHaveBeenCalled();
  });
});

describe('logarithmic frequency mapping', () => {
  it('produces a mapping array with length equal to frequencyBinCount', () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const analyser = new OfflineAnalyser(createAudioBuffer(1.0));

    const mapping = (analyser as unknown as OfflineAnalyserInternals)
      .logFrequencyMapping;

    expect(mapping).toBeDefined();
    expect(mapping.length).toBe(analyser.frequencyBinCount);
  });

  it('produces mapping entries that are arrays of indices', () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const analyser = new OfflineAnalyser(createAudioBuffer(1.0));
    const mapping = (analyser as unknown as OfflineAnalyserInternals)
      .logFrequencyMapping;

    // Each entry should be an array of at least one index
    for (const entry of mapping) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has lower bins mapping to more entries (pooling)', () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const analyser = new OfflineAnalyser(createAudioBuffer(1.0));
    const mapping = (analyser as unknown as OfflineAnalyserInternals)
      .logFrequencyMapping;

    // Higher frequency bins should map to more linear bins (log compression)
    const lastBinPoolSize = mapping[mapping.length - 1].length;
    const firstBinPoolSize = mapping[0].length;

    // The last bins should generally pool more frequencies than the first
    expect(lastBinPoolSize).toBeGreaterThanOrEqual(firstBinPoolSize);
  });
});

describe('analyseToFrames (CQT)', () => {
  it('returns SpectrogramData with correct metadata', () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const sampleRate = 44100;
    const duration = 0.1;
    const audioBuffer = createAudioBuffer(duration, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result: SpectrogramData = analyser.analyseToFrames();

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBeCloseTo(duration, 3);
    expect(result.frequencyBinCount).toBe(CQT_BIN_COUNT);
    expect(result.timeResolution).toBe(HOP_SECONDS);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
  });

  it('produces the expected number of frames', () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const duration = 0.1;
    const audioBuffer = createAudioBuffer(duration);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = analyser.analyseToFrames();
    const expectedFrames = Math.floor(duration / HOP_SECONDS);

    expect(result.frequencyFrames).toHaveLength(expectedFrames);
  });

  it('stores each frame as an independent Uint8Array copy', () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = analyser.analyseToFrames();

    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(CQT_BIN_COUNT);
    }

    if (result.frequencyFrames.length >= 2) {
      expect(result.frequencyFrames[0]).not.toBe(result.frequencyFrames[1]);
    }
  });
});
