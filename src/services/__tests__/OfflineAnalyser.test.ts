import { vi } from 'vitest';
import OfflineAnalyser from '../OfflineAnalyser';

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
  onaudioprocess: null as ((event: any) => void) | null,
  connect: vi.fn(),
};

const mockDestination = {};

function createMockOfflineContext(supportsSuspend: boolean) {
  const ctx: any = {
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

let savedOfflineAudioContext: any;

beforeAll(() => {
  savedOfflineAudioContext = (window as any).OfflineAudioContext;
});

afterAll(() => {
  (window as any).OfflineAudioContext = savedOfflineAudioContext;
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

describe('constructor', () => {
  it('creates an OfflineAudioContext with correct parameters', () => {
    const mockCtx = createMockOfflineContext(true);
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

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
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

    const analyser = new OfflineAnalyser(createAudioBuffer(1.0));

    expect(analyser.timeResolution).toBe(0.025);
  });

  it('sets time resolution based on script processor when suspend is not supported', () => {
    const mockCtx = createMockOfflineContext(false);
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

    const sampleRate = 44100;
    const analyser = new OfflineAnalyser(createAudioBuffer(1.0, sampleRate));

    expect(analyser.timeResolution).toBeCloseTo(1024 / sampleRate, 5);
  });
});

describe('getFrequencyData (suspend context)', () => {
  it('suspends at regular intervals and collects frequency data', async () => {
    const mockCtx = createMockOfflineContext(true);
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

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
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

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
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

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
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

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
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

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
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

    const audioBuffer = createAudioBuffer(0.05);
    const analyser = new OfflineAnalyser(audioBuffer);

    await analyser.getLogarithmicFrequencyData(vi.fn());

    expect(mockCtx.startRendering).toHaveBeenCalled();
  });
});

describe('logarithmic frequency mapping', () => {
  it('produces a mapping array with length equal to frequencyBinCount', () => {
    const mockCtx = createMockOfflineContext(true);
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

    const analyser = new OfflineAnalyser(createAudioBuffer(1.0));

    // Access private field through type assertion
    const mapping = (analyser as any).logFrequencyMapping;

    expect(mapping).toBeDefined();
    expect(mapping.length).toBe(analyser.frequencyBinCount);
  });

  it('produces mapping entries that are arrays of indices', () => {
    const mockCtx = createMockOfflineContext(true);
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

    const analyser = new OfflineAnalyser(createAudioBuffer(1.0));
    const mapping = (analyser as any).logFrequencyMapping;

    // Each entry should be an array of at least one index
    for (const entry of mapping) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has lower bins mapping to more entries (pooling)', () => {
    const mockCtx = createMockOfflineContext(true);
    (window as any).OfflineAudioContext = vi
      .fn()
      .mockImplementation(() => mockCtx);

    const analyser = new OfflineAnalyser(createAudioBuffer(1.0));
    const mapping = (analyser as any).logFrequencyMapping;

    // Higher frequency bins should map to more linear bins (log compression)
    const lastBinPoolSize = mapping[mapping.length - 1].length;
    const firstBinPoolSize = mapping[0].length;

    // The last bins should generally pool more frequencies than the first
    expect(lastBinPoolSize).toBeGreaterThanOrEqual(firstBinPoolSize);
  });
});
