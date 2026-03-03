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

vi.mock('tone', () => {
  function mockBlob() {
    return { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(16)) };
  }
  // Must be a regular function (not arrow) to support `new` in Vitest v4
  function makeNode() {
    return {
      connect: vi.fn().mockReturnThis(),
      chain: vi.fn().mockReturnThis(),
      sync: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      toDestination: vi.fn().mockReturnThis(),
      dispose: vi.fn(),
      mute: false,
      solo: false,
      volume: { rampTo: vi.fn() },
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
  };
});
