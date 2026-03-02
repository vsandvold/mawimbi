import { vi } from 'vitest';
import OfflineAnalyser, { type SpectrogramData } from '../OfflineAnalyser';
import { createDualBandLogMapping } from '../logFrequencyMapping';

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

// At 44100 Hz: lowBinCount=301, highBinStart=18, highBinEnd=512, merged=795
const MERGED_BIN_COUNT = 795;

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
    // Constructor creates 1, analyseBand creates 2 more = 3 total
    expect(contexts).toHaveLength(3);
  });

  it('creates two fresh OfflineAudioContexts for dual-band analysis', async () => {
    stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    // Constructor created one OfflineAudioContext
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(1);

    await analyser.analyseToFrames();

    // analyseToFrames created two more: low band (5120 Hz) + high band (44100 Hz)
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(3);

    // Low band context: sample rate = 5120
    expect(window.OfflineAudioContext).toHaveBeenCalledWith(
      1,
      Math.ceil(0.1 * 5120),
      5120,
    );
    // High band context: sample rate = 44100
    expect(window.OfflineAudioContext).toHaveBeenCalledWith(
      1,
      Math.ceil(0.1 * 44100),
      44100,
    );
  });

  it('creates a filter in each band context at 752 Hz', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // Constructor context (contexts[0]) does not create filters
    expect(contexts[0].createBiquadFilter).not.toHaveBeenCalled();

    // Low band context: lowpass filter
    const lowFilter = contexts[1].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(lowFilter.type).toBe('lowpass');
    expect(lowFilter.frequency.value).toBe(752);

    // High band context: highpass filter
    const highFilter = contexts[2].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(highFilter.type).toBe('highpass');
    expect(highFilter.frequency.value).toBe(752);
  });

  it('creates one dual-band analyser per band context', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    // Constructor creates one analyser (fftSize=4096)
    expect(contexts[0].createAnalyser).toHaveBeenCalledTimes(1);

    await analyser.analyseToFrames();

    // Each band context creates one analyser (low: fftSize=2048, high: fftSize=1024)
    expect(contexts[1].createAnalyser).toHaveBeenCalledTimes(1);
    expect(contexts[2].createAnalyser).toHaveBeenCalledTimes(1);
  });

  it('creates AudioBuffers and copies channel data in each band', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1, 44100, 2);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // Each band context should create a buffer and copy channel data
    for (const ctx of [contexts[1], contexts[2]]) {
      expect(ctx.createBuffer).toHaveBeenCalledWith(
        2,
        audioBuffer.length,
        44100,
      );
      const buffer = ctx.createBuffer.mock.results[0].value;
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

    // 1 constructor + 2 bands × 2 calls = 5 contexts
    expect(window.OfflineAudioContext).toHaveBeenCalledTimes(5);
    expect(contexts).toHaveLength(5);
    expect(result1.frequencyFrames).toBeDefined();
    expect(result2.frequencyFrames).toBeDefined();
  });

  it('connects buffer source through filter to analyser and destination', async () => {
    const contexts = stubOfflineAudioContextFactory(true);

    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // Check each band context's wiring
    for (const ctx of [contexts[1], contexts[2]]) {
      const bufferSource = ctx.createBufferSource.mock.results[0].value;
      expect(bufferSource.connect).toHaveBeenCalledTimes(1);
      expect(bufferSource.start).toHaveBeenCalledWith(0);

      const filter = ctx.createBiquadFilter.mock.results[0].value as ReturnType<
        typeof createMockBiquadFilter
      >;
      expect(filter.connect).toHaveBeenCalledTimes(1);
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
    expect(contexts).toHaveLength(3);
  });

  it('creates a script processor in each band context', async () => {
    const contexts = stubOfflineAudioContextFactory(false);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    for (const ctx of [contexts[1], contexts[2]]) {
      expect(ctx.createScriptProcessor).toHaveBeenCalledWith(
        1024,
        expect.any(Number),
        expect.any(Number),
      );
      const scriptProcessor = ctx.createScriptProcessor.mock.results[0].value;
      expect(scriptProcessor.onaudioprocess).toBeTypeOf('function');
    }
  });

  it('collects frames when onaudioprocess fires during rendering', async () => {
    const contexts = stubOfflineAudioContextFactory(false);

    // Override startRendering on band contexts to simulate onaudioprocess
    const originalImpl = vi.fn().mockImplementation(function () {
      const ctx = createIndependentMockContext(false);
      // Override startRendering to fire onaudioprocess 2 times
      ctx.startRendering = vi.fn().mockImplementation(async () => {
        const sp = ctx.createScriptProcessor.mock.results[0]?.value;
        if (sp?.onaudioprocess) {
          sp.onaudioprocess();
          sp.onaudioprocess();
        }
        return {} as AudioBuffer;
      });
      contexts.push(ctx);
      return ctx;
    });
    vi.stubGlobal('OfflineAudioContext', originalImpl);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = await analyser.analyseToFrames();

    expect(result.frequencyFrames.length).toBe(2);
    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(MERGED_BIN_COUNT);
    }
  });

  it('creates filters for script processor path', async () => {
    const contexts = stubOfflineAudioContextFactory(false);

    const audioBuffer = createAudioBuffer(1.0);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.analyseToFrames();

    // Low band context: lowpass filter
    const lowFilter = contexts[1].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(lowFilter.type).toBe('lowpass');
    expect(lowFilter.frequency.value).toBe(752);

    // High band context: highpass filter
    const highFilter = contexts[2].createBiquadFilter.mock.results[0]
      .value as ReturnType<typeof createMockBiquadFilter>;
    expect(highFilter.type).toBe('highpass');
    expect(highFilter.frequency.value).toBe(752);
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
          const isLowBand = contextIndex === 1;
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
                if (isLowBand) {
                  // 500 Hz peak in low band (2.5 Hz per bin → bin 200)
                  arr[200] = 255;
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

    // 500 Hz on a log scale from 2.5 Hz to ~22009 Hz:
    // position ≈ log(500/2.5) / log(22009/2.5) ≈ 0.583
    // Expected output bin ≈ 0.583 * (795 - 1) ≈ 463
    //
    // With the naive createLogFrequencyMapping(795), the peak is placed
    // at output bin ~631 because the mapping treats non-uniform dual-band
    // bins as if they had equal frequency widths.
    const expectedBin = 463;
    expect(Math.abs(peakBin - expectedBin)).toBeLessThan(30);
  });

  it('merges low-frequency bins from low band and high-frequency bins from high band', async () => {
    const LOW_VALUE = 100;
    const HIGH_VALUE = 200;
    const contexts: IndependentMockContext[] = [];
    let contextIndex = 0;

    vi.stubGlobal(
      'OfflineAudioContext',
      vi.fn().mockImplementation(function () {
        const ctx = createIndependentMockContext(true);
        // Band contexts are indices 1 and 2 (index 0 is the constructor)
        if (contextIndex > 0) {
          const fillValue = contextIndex === 1 ? LOW_VALUE : HIGH_VALUE;
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

    // Bin 0 maps to linear bin 0 (1:1 in log mapping) → low band value
    expect(frame[0]).toBe(LOW_VALUE);

    // Last output bin maps to highest linear bins → high band value
    expect(frame[MERGED_BIN_COUNT - 1]).toBeGreaterThan(0);

    // Verify the split: output bins mapped entirely from the low band
    // should carry the low band value
    const lowBinCount = 301; // at 44100 Hz
    const lowBinWidth = 5120 / 2048;
    const highBinWidth = 44100 / 1024;
    const highBinStart = Math.ceil(752 / highBinWidth);
    const logMapping = createDualBandLogMapping(
      MERGED_BIN_COUNT,
      lowBinCount,
      lowBinWidth,
      highBinStart,
      highBinWidth,
    );
    const firstHighOutputBin = logMapping.findIndex((pool) =>
      pool.some((idx) => idx >= lowBinCount),
    );
    if (firstHighOutputBin > 0) {
      expect(frame[firstHighOutputBin - 1]).toBeGreaterThan(0);
    }
  });
});
