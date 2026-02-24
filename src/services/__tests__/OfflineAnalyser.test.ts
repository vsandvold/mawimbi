import { vi } from 'vitest';
import OfflineAnalyser, { type SpectrogramData } from '../OfflineAnalyser';

// OfflineAudioContext is not available in jsdom, so we need a thorough mock
const mockGetByteFrequencyData = vi.fn();
const mockStartRendering = vi.fn();
const mockSuspend = vi.fn();
const mockResume = vi.fn();
const mockConnect = vi.fn();

const mockAnalyser = {
  fftSize: 4096,
  frequencyBinCount: 2048,
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
    createAnalyser: vi.fn().mockReturnValue({ ...mockAnalyser }),
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

describe('analyseToFrames (suspend context)', () => {
  it('returns SpectrogramData with correct metadata', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const sampleRate = 44100;
    const duration = 0.1;
    const audioBuffer = createAudioBuffer(duration, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result: SpectrogramData = await analyser.analyseToFrames();

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBe(duration);
    expect(result.frequencyBinCount).toBe(2048);
    expect(result.timeResolution).toBe(0.025);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
  });

  it('creates a fresh OfflineAudioContext separate from the constructor', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    // Constructor created one OfflineAudioContext
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(1);

    await analyser.analyseToFrames();

    // analyseToFrames created a second, fresh OfflineAudioContext
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(2);
  });

  it('collects one frequency frame per suspend point', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    // 100ms duration with 25ms step → suspend at 25ms, 50ms, 75ms → 3 frames
    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    expect(result.frequencyFrames.length).toBe(3);
  });

  it('stores each frame as an independent Uint8Array copy', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(2048);
    }
    // Frames are distinct objects, not references to the same buffer
    if (result.frequencyFrames.length >= 2) {
      expect(result.frequencyFrames[0]).not.toBe(result.frequencyFrames[1]);
    }
  });

  it('can be called multiple times since it creates a fresh context each time', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result1 = await analyser.analyseToFrames();
    const result2 = await analyser.analyseToFrames();

    // 1 constructor + 2 analyseToFrames calls = 3 contexts created
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(3);
    expect(result1.frequencyFrames).toBeDefined();
    expect(result2.frequencyFrames).toBeDefined();
  });

  it('connects buffer source to analyser and destination', async () => {
    const mockCtx = createMockOfflineContext(true);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // analyseToFrames uses the second buffer source (constructor used the first createAnalyser but not createBufferSource)
    const bufferSource = mockCtx.createBufferSource.mock.results[0].value;
    expect(bufferSource.connect).toHaveBeenCalled();
    expect(bufferSource.start).toHaveBeenCalledWith(0);
    expect(bufferSource.buffer).toBe(audioBuffer);
  });
});

describe('analyseToFrames (script processor fallback)', () => {
  it('returns SpectrogramData with correct metadata', async () => {
    const mockCtx = createMockOfflineContext(false);
    stubOfflineAudioContext(mockCtx);

    const sampleRate = 44100;
    const duration = 1.0;
    const audioBuffer = createAudioBuffer(duration, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBe(duration);
    expect(result.frequencyBinCount).toBe(2048);
    expect(result.timeResolution).toBeCloseTo(1024 / sampleRate, 5);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
  });

  it('creates a script processor and sets onaudioprocess', async () => {
    const mockCtx = createMockOfflineContext(false);
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    expect(mockCtx.createScriptProcessor).toHaveBeenCalledWith(
      1024,
      expect.any(Number),
      expect.any(Number),
    );
    const scriptProcessor = mockCtx.createScriptProcessor.mock.results[0].value;
    expect(scriptProcessor.onaudioprocess).toBeTypeOf('function');
  });

  it('collects frames when onaudioprocess fires during rendering', async () => {
    const mockCtx = createMockOfflineContext(false);
    // Override startRendering to simulate audio processing events
    mockCtx.startRendering = vi.fn().mockImplementation(async () => {
      const sp = mockCtx.createScriptProcessor.mock.results[0].value;
      if (sp.onaudioprocess) {
        sp.onaudioprocess();
        sp.onaudioprocess();
      }
      return {} as AudioBuffer;
    });
    stubOfflineAudioContext(mockCtx);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    expect(result.frequencyFrames.length).toBe(2);
    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(2048);
    }
  });
});
