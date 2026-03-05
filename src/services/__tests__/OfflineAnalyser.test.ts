import { vi } from 'vitest';
import {
  BAND_CONFIGS,
  calculateMultiBandMergeParams,
  createMergedLogMapping,
} from '../dualBandAnalysis';
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

const mockScriptProcessor = {
  onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
  connect: vi.fn(),
};

const mockDestination = {};

type MockOfflineContext = {
  destination: typeof mockDestination;
  currentTime: number;
  createAnalyser: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createBuffer: ReturnType<typeof vi.fn>;
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
    createBiquadFilter: vi
      .fn()
      .mockImplementation(() => createMockBiquadFilter()),
    createBufferSource: vi.fn().mockReturnValue({ ...mockBufferSource }),
    createBuffer: vi.fn().mockReturnValue({ copyToChannel: vi.fn() }),
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

// Factory-based mock infrastructure for analyseToFrames tests.
// Each `new OfflineAudioContext()` call returns a fresh, independent context.
type IndependentMockContext = {
  destination: object;
  currentTime: number;
  createAnalyser: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createBuffer: ReturnType<typeof vi.fn>;
  createScriptProcessor: ReturnType<typeof vi.fn>;
  startRendering: ReturnType<typeof vi.fn>;
  suspend?: ReturnType<typeof vi.fn>;
  resume?: ReturnType<typeof vi.fn>;
};

function createIndependentAnalyserNode() {
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
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
  };
}

function createIndependentMockContext(
  supportsSuspend: boolean,
): IndependentMockContext {
  const ctx: IndependentMockContext = {
    destination: {},
    currentTime: 0,
    createAnalyser: vi
      .fn()
      .mockImplementation(() => createIndependentAnalyserNode()),
    createBiquadFilter: vi
      .fn()
      .mockImplementation(() => createMockBiquadFilter()),
    createBufferSource: vi.fn().mockReturnValue({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
    }),
    createBuffer: vi.fn().mockReturnValue({ copyToChannel: vi.fn() }),
    createScriptProcessor: vi.fn().mockReturnValue({
      onaudioprocess: null as (() => void) | null,
      connect: vi.fn(),
    }),
    startRendering: vi.fn().mockResolvedValue({} as AudioBuffer),
  };
  if (supportsSuspend) {
    ctx.suspend = vi.fn().mockReturnValue(Promise.resolve());
    ctx.resume = vi.fn();
  }
  return ctx;
}

function stubOfflineAudioContextFactory(
  supportsSuspend: boolean,
): IndependentMockContext[] {
  const contexts: IndependentMockContext[] = [];
  vi.stubGlobal(
    'OfflineAudioContext',
    vi.fn().mockImplementation(function () {
      const ctx = createIndependentMockContext(supportsSuspend);
      contexts.push(ctx);
      return ctx;
    }),
  );
  return contexts;
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

const BAND_COUNT = BAND_CONFIGS.length;
// Constructor creates 1 context, analyseToFrames creates BAND_COUNT more
const TOTAL_CONTEXTS = 1 + BAND_COUNT;

// At 44100 Hz: multi-band merge produces this many bins
const MERGED_BIN_COUNT = calculateMultiBandMergeParams(44100).mergedBinCount;

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
    const contexts = stubOfflineAudioContextFactory(true);

    const sampleRate = 44100;
    const duration = 0.1;
    const audioBuffer = createAudioBuffer(duration, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result: SpectrogramData = await analyser.analyseToFrames();

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBe(duration);
    expect(result.frequencyBinCount).toBe(MERGED_BIN_COUNT);
    expect(result.timeResolution).toBe(0.025);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
    // Constructor creates 1, analyseBand creates BAND_COUNT more
    expect(contexts).toHaveLength(TOTAL_CONTEXTS);
  });

  it('creates fresh OfflineAudioContexts for each band', async () => {
    stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    // Constructor created one OfflineAudioContext
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(1);

    await analyser.analyseToFrames();

    // analyseToFrames created BAND_COUNT more
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(TOTAL_CONTEXTS);

    // Band 0: sample rate = 5120
    expect(window.OfflineAudioContext).toHaveBeenCalledWith(
      1,
      Math.ceil(0.1 * 5120),
      5120,
    );
    // Band 1: sample rate = 5120
    expect(window.OfflineAudioContext).toHaveBeenCalledWith(
      1,
      Math.ceil(0.1 * 5120),
      5120,
    );
    // Band 2: sample rate = 20480
    expect(window.OfflineAudioContext).toHaveBeenCalledWith(
      1,
      Math.ceil(0.1 * 20480),
      20480,
    );
    // Band 3: sample rate = 44100 (native)
    expect(window.OfflineAudioContext).toHaveBeenCalledWith(
      1,
      Math.ceil(0.1 * 44100),
      44100,
    );
  });

  it('creates filters in each band context at the correct frequencies', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // Constructor context (contexts[0]) does not create filters
    expect(contexts[0].createBiquadFilter).not.toHaveBeenCalled();

    // Band 0: lowpass only at 320
    expect(contexts[1].createBiquadFilter).toHaveBeenCalledTimes(1);
    const band0Filter = contexts[1].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(band0Filter.type).toBe('lowpass');
    expect(band0Filter.frequency.value).toBe(320);

    // Band 1: highpass@320 + lowpass@1280
    expect(contexts[2].createBiquadFilter).toHaveBeenCalledTimes(2);
    const band1Hp = contexts[2].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    const band1Lp = contexts[2].createBiquadFilter.mock.results[1]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(band1Hp.type).toBe('highpass');
    expect(band1Hp.frequency.value).toBe(320);
    expect(band1Lp.type).toBe('lowpass');
    expect(band1Lp.frequency.value).toBe(1280);

    // Band 2: highpass@1280 + lowpass@5120
    expect(contexts[3].createBiquadFilter).toHaveBeenCalledTimes(2);
    const band2Hp = contexts[3].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    const band2Lp = contexts[3].createBiquadFilter.mock.results[1]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(band2Hp.type).toBe('highpass');
    expect(band2Hp.frequency.value).toBe(1280);
    expect(band2Lp.type).toBe('lowpass');
    expect(band2Lp.frequency.value).toBe(5120);

    // Band 3: highpass only at 5120
    expect(contexts[4].createBiquadFilter).toHaveBeenCalledTimes(1);
    const band3Filter = contexts[4].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(band3Filter.type).toBe('highpass');
    expect(band3Filter.frequency.value).toBe(5120);
  });

  it('creates one analyser per band context', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    // Constructor creates one analyser (fftSize=4096)
    expect(contexts[0].createAnalyser).toHaveBeenCalledTimes(1);

    await analyser.analyseToFrames();

    // Each band context creates one analyser
    for (let i = 1; i <= BAND_COUNT; i++) {
      expect(contexts[i].createAnalyser).toHaveBeenCalledTimes(1);
    }
  });

  it('creates AudioBuffers and copies channel data in each band', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1, 44100, 2);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // Each band context should create a buffer and copy channel data
    for (let i = 1; i <= BAND_COUNT; i++) {
      expect(contexts[i].createBuffer).toHaveBeenCalledWith(
        2,
        audioBuffer.length,
        44100,
      );
      const buffer = contexts[i].createBuffer.mock.results[0].value;
      expect(buffer.copyToChannel).toHaveBeenCalledTimes(2);
    }

    // audioBuffer.getChannelData should have been called for each channel in each band
    expect(audioBuffer.getChannelData).toHaveBeenCalledWith(0);
    expect(audioBuffer.getChannelData).toHaveBeenCalledWith(1);
  });

  it('collects one frequency frame per suspend point', async () => {
    stubOfflineAudioContextFactory(true);

    // 100ms duration with 25ms step → suspend at 25ms, 50ms, 75ms → 3 frames
    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    expect(result.frequencyFrames.length).toBe(3);
  });

  it('stores each frame as an independent Uint8Array copy', async () => {
    stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(MERGED_BIN_COUNT);
    }
    // Frames are distinct objects, not references to the same buffer
    if (result.frequencyFrames.length >= 2) {
      expect(result.frequencyFrames[0]).not.toBe(result.frequencyFrames[1]);
    }
  });

  it('can be called multiple times since each call creates fresh contexts', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result1 = await analyser.analyseToFrames();
    const result2 = await analyser.analyseToFrames();

    // 1 constructor + BAND_COUNT bands × 2 calls
    const expectedContextCount = 1 + BAND_COUNT * 2;
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(
      expectedContextCount,
    );
    expect(contexts).toHaveLength(expectedContextCount);
    expect(result1.frequencyFrames).toBeDefined();
    expect(result2.frequencyFrames).toBeDefined();
  });

  it('connects buffer source through filters to analyser and destination', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // Check each band context's wiring
    for (let i = 1; i <= BAND_COUNT; i++) {
      const ctx = contexts[i];
      const bufferSource = ctx.createBufferSource.mock.results[0].value;
      expect(bufferSource.connect).toHaveBeenCalledTimes(1);
      expect(bufferSource.start).toHaveBeenCalledWith(0);
    }
  });
});

describe('analyseToFrames (script processor fallback)', () => {
  it('returns SpectrogramData with correct metadata', async () => {
    const contexts = stubOfflineAudioContextFactory(false);

    const sampleRate = 44100;
    const duration = 1.0;
    const audioBuffer = createAudioBuffer(duration, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBe(duration);
    expect(result.frequencyBinCount).toBe(MERGED_BIN_COUNT);
    expect(result.timeResolution).toBeCloseTo(1024 / sampleRate, 5);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
    expect(contexts).toHaveLength(TOTAL_CONTEXTS);
  });

  it('creates a script processor in each band context', async () => {
    const contexts = stubOfflineAudioContextFactory(false);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    for (let i = 1; i <= BAND_COUNT; i++) {
      expect(contexts[i].createScriptProcessor).toHaveBeenCalledWith(
        1024,
        expect.any(Number),
        expect.any(Number),
      );
      const scriptProcessor =
        contexts[i].createScriptProcessor.mock.results[0].value;
      expect(scriptProcessor.onaudioprocess).toBeTypeOf('function');
    }
  });

  it('creates filters for script processor path', async () => {
    const contexts = stubOfflineAudioContextFactory(false);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // Band 0: lowpass@320
    const band0Filter = contexts[1].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(band0Filter.type).toBe('lowpass');
    expect(band0Filter.frequency.value).toBe(320);

    // Band 3: highpass@5120
    const band3Filter = contexts[4].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(band3Filter.type).toBe('highpass');
    expect(band3Filter.frequency.value).toBe(5120);
  });
});

describe('analyseToFrames merge logic', () => {
  it('uses maximum when pooling bins in log frequency mapping', async () => {
    const FILL_VALUE = 200;
    const contexts: IndependentMockContext[] = [];
    let contextIndex = 0;

    vi.stubGlobal(
      'OfflineAudioContext',
      vi.fn().mockImplementation(function () {
        const ctx = createIndependentMockContext(true);
        if (contextIndex > 0) {
          ctx.createAnalyser = vi.fn().mockImplementation(() => ({
            _fftSize: 1024,
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
        }
        contextIndex++;
        contexts.push(ctx);
        return ctx;
      }),
    );

    const sampleRate = 44100;
    const audioBuffer = createAudioBuffer(0.05, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    const frame = result.frequencyFrames[0];
    expect(frame).toBeDefined();

    // Every output bin should be exactly FILL_VALUE (the max of its pooled
    // inputs), not a sum that overflows Uint8Array.
    for (let i = 0; i < MERGED_BIN_COUNT; i++) {
      expect(frame[i]).toBe(FILL_VALUE);
    }
  });

  it('places a low-frequency peak at the correct log-frequency position', async () => {
    const contexts: IndependentMockContext[] = [];
    let contextIndex = 0;

    vi.stubGlobal(
      'OfflineAudioContext',
      vi.fn().mockImplementation(function () {
        const ctx = createIndependentMockContext(true);
        if (contextIndex > 0) {
          const isBand0 = contextIndex === 1;
          ctx.createAnalyser = vi.fn().mockImplementation(() => ({
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
            getByteFrequencyData: vi
              .fn()
              .mockImplementation((arr: Uint8Array) => {
                arr.fill(0);
                if (isBand0) {
                  // 200 Hz peak in band 0 (2.5 Hz per bin → bin 80)
                  arr[80] = 255;
                }
              }),
            connect: vi.fn(),
          }));
        }
        contextIndex++;
        contexts.push(ctx);
        return ctx;
      }),
    );

    const sampleRate = 44100;
    const audioBuffer = createAudioBuffer(0.05, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    const frame = result.frequencyFrames[0];
    expect(frame).toBeDefined();

    // Find peak position in the log-mapped output
    let peakBin = 0;
    for (let i = 1; i < frame.length; i++) {
      if (frame[i] > frame[peakBin]) peakBin = i;
    }

    // 200 Hz on a log scale should be in the lower portion of the output
    // (below the midpoint since the range spans 2.5 Hz to ~22 kHz)
    const expectedFraction = 0.48;
    const actualFraction = peakBin / (MERGED_BIN_COUNT - 1);
    expect(Math.abs(actualFraction - expectedFraction)).toBeLessThan(0.1);
  });

  it('merges bins from all bands correctly', async () => {
    const BAND_VALUES = [100, 120, 160, 200];
    const contexts: IndependentMockContext[] = [];
    let contextIndex = 0;

    vi.stubGlobal(
      'OfflineAudioContext',
      vi.fn().mockImplementation(function () {
        const ctx = createIndependentMockContext(true);
        // Band contexts are indices 1..BAND_COUNT (index 0 is the constructor)
        if (contextIndex > 0) {
          const bandIdx = contextIndex - 1;
          const fillValue =
            bandIdx < BAND_VALUES.length ? BAND_VALUES[bandIdx] : 0;
          ctx.createAnalyser = vi.fn().mockImplementation(() => ({
            _fftSize: 1024,
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
        }
        contextIndex++;
        contexts.push(ctx);
        return ctx;
      }),
    );

    const sampleRate = 44100;
    const audioBuffer = createAudioBuffer(0.05, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    const frame = result.frequencyFrames[0];
    expect(frame).toBeDefined();

    // Bin 0 maps to lowest frequencies → band 0 value
    expect(frame[0]).toBe(BAND_VALUES[0]);

    // Last output bin maps to highest frequencies → last band value
    expect(frame[MERGED_BIN_COUNT - 1]).toBeGreaterThan(0);

    // Verify the split: output bins mapped from band 0 should carry band 0's value
    const { bands } = calculateMultiBandMergeParams(sampleRate);
    const logMapping = createMergedLogMapping(sampleRate);
    const band0BinCount = bands[0].binCount;
    const firstNonBand0OutputBin = logMapping.findIndex((pool) =>
      pool.some((idx) => idx >= band0BinCount),
    );
    if (firstNonBand0OutputBin > 0) {
      expect(frame[firstNonBand0OutputBin - 1]).toBeGreaterThan(0);
    }
  });
});
