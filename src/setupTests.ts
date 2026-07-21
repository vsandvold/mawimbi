import '@testing-library/jest-dom';
import { vi } from 'vitest';

window.TONE_SILENCE_LOGGING = true;

// jsdom does not implement ResizeObserver — provide a no-op stub
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// jsdom does not implement HTMLCanvasElement.getContext — provide a minimal
// mock that prevents "not implemented" errors in component tests
if (!HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
}

// jsdom does not implement matchMedia — provide a default stub (no
// preference matched) so components can query media features without
// throwing. Tests that need a specific match override it locally.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

vi.mock('tone', () => {
  function mockBlob() {
    return { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(16)) };
  }
  // Must be a regular function (not arrow) to support `new` in Vitest v4
  function makeNode() {
    return {
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn().mockReturnThis(),
      chain: vi.fn().mockReturnThis(),
      sync: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      toDestination: vi.fn().mockReturnThis(),
      dispose: vi.fn(),
      mute: false,
      solo: false,
      volume: makeRampableParam(0),
      state: 'stopped',
      getValue: vi.fn().mockReturnValue(0),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      stop: vi.fn().mockResolvedValue(mockBlob()),
    };
  }
  function makeRecorderNode() {
    return { ...makeNode(), state: 'stopped' };
  }
  function makeRampableParam(initial: number) {
    return { value: initial, rampTo: vi.fn() };
  }
  // Effect node shapes validated against the real Tone 15.1.22 build in a
  // browser (#489): Reverb/FeedbackDelay are Effect subclasses with a `wet`
  // signal; Reverb's IR generates asynchronously (`ready` resolves when
  // audible); Filter is a plain ToneAudioNode — frequency/Q signals, no `wet`.
  function makeReverbNode() {
    return {
      ...makeNode(),
      wet: makeRampableParam(1),
      decay: 1.5,
      preDelay: 0.01,
      ready: Promise.resolve(),
      generate: vi.fn().mockResolvedValue(undefined),
    };
  }
  function makeFeedbackDelayNode() {
    return {
      ...makeNode(),
      wet: makeRampableParam(1),
      feedback: makeRampableParam(0.125),
      delayTime: makeRampableParam(0.25),
    };
  }
  function makeFilterNode() {
    return {
      ...makeNode(),
      frequency: makeRampableParam(350),
      Q: makeRampableParam(1),
      type: 'lowpass',
    };
  }
  function makeGainNode(initialGain = 1) {
    return {
      ...makeNode(),
      gain: makeRampableParam(initialGain),
    };
  }
  const transportMock = {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    seconds: 0,
    state: 'stopped',
  };
  const contextMock = {
    state: 'suspended',
    decodeAudioData: vi.fn().mockResolvedValue({}),
    lookAhead: 0.05,
    sampleRate: 44100,
    destination: {},
    addAudioWorkletModule: vi.fn().mockResolvedValue(undefined),
    createAudioWorkletNode: vi.fn().mockReturnValue({
      port: { postMessage: vi.fn(), onmessage: null },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    rawContext: {
      outputLatency: 0.01,
      baseLatency: 0.005,
      sampleRate: 44100,
      destination: {},
      createBiquadFilter: vi.fn().mockImplementation(() => ({
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createAnalyser: vi.fn().mockImplementation(() => {
        let fftSize = 2048;
        return {
          get fftSize() {
            return fftSize;
          },
          set fftSize(v: number) {
            fftSize = v;
          },
          get frequencyBinCount() {
            return fftSize / 2;
          },
          smoothingTimeConstant: 0,
          minDecibels: -100,
          maxDecibels: -30,
          getByteFrequencyData: vi.fn(),
          getFloatTimeDomainData: vi.fn(),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }),
      createGain: vi.fn().mockImplementation(() => ({
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
    },
  };
  function makeAnalyserNode() {
    return {
      ...makeNode(),
      getValue: vi.fn().mockReturnValue(new Float32Array(2048)),
    };
  }
  return {
    Analyser: vi.fn().mockImplementation(makeAnalyserNode),
    Meter: vi.fn().mockImplementation(makeNode),
    UserMedia: vi.fn().mockImplementation(makeNode),
    Player: vi.fn().mockImplementation(makeNode),
    Channel: vi.fn().mockImplementation(makeNode),
    Recorder: vi.fn().mockImplementation(makeRecorderNode),
    Reverb: vi.fn().mockImplementation(makeReverbNode),
    FeedbackDelay: vi.fn().mockImplementation(makeFeedbackDelayNode),
    Filter: vi.fn().mockImplementation(makeFilterNode),
    Gain: vi.fn().mockImplementation(makeGainNode),
    dbToGain: vi.fn().mockImplementation((db: number) => 10 ** (db / 20)),
    Transport: transportMock,
    getTransport: vi.fn().mockReturnValue(transportMock),
    start: vi.fn().mockImplementation(() => {
      // Simulate the real Tone.start() behaviour: the AudioContext transitions
      // from 'suspended' to 'running' when the promise resolves.
      contextMock.state = 'running';
      return Promise.resolve();
    }),
    getDestination: vi.fn().mockReturnValue(makeNode()),
    context: contextMock,
    getContext: vi.fn().mockReturnValue(contextMock),
    setContext: vi.fn(),
    // Must be a regular function (not arrow) to support `new`
    Context: vi.fn().mockImplementation(function () {}),
  };
});

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      pathname: 'path',
    }),
    useParams: () => ({ id: 'test-project-id' }),
  };
});
