import { vi } from 'vitest';
import WorkletRecorder from '../WorkletRecorder';

// --- AudioBuffer stub (jsdom doesn't implement the constructor) ---

const OriginalAudioBuffer = globalThis.AudioBuffer;

beforeAll(() => {
  globalThis.AudioBuffer = class MockAudioBuffer {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    duration: number;
    private channels: Float32Array[];

    constructor(options: {
      numberOfChannels: number;
      length: number;
      sampleRate: number;
    }) {
      this.numberOfChannels = options.numberOfChannels;
      this.length = options.length;
      this.sampleRate = options.sampleRate;
      this.duration = options.length / options.sampleRate;
      this.channels = [];
      for (let ch = 0; ch < options.numberOfChannels; ch++) {
        this.channels.push(new Float32Array(options.length));
      }
    }

    getChannelData(ch: number): Float32Array {
      return this.channels[ch];
    }
  } as unknown as typeof AudioBuffer;
});

afterAll(() => {
  globalThis.AudioBuffer = OriginalAudioBuffer;
});

// --- AudioWorkletNode mock ---

type MessageHandler = (event: MessageEvent) => void;

function createMockPort() {
  const listeners = new Map<string, MessageHandler[]>();
  let onmessageHandler: MessageHandler | null = null;
  return {
    postMessage: vi.fn(),
    addEventListener: vi.fn((type: string, handler: MessageHandler) => {
      const handlers = listeners.get(type) ?? [];
      handlers.push(handler);
      listeners.set(type, handlers);
    }),
    removeEventListener: vi.fn((type: string, handler: MessageHandler) => {
      const handlers = listeners.get(type) ?? [];
      listeners.set(
        type,
        handlers.filter((h) => h !== handler),
      );
    }),
    get onmessage() {
      return onmessageHandler;
    },
    set onmessage(handler: MessageHandler | null) {
      onmessageHandler = handler;
    },
    // Test helper: simulate a message from the processor
    _simulateMessage(data: unknown) {
      const event = { data } as MessageEvent;
      if (onmessageHandler) onmessageHandler(event);
      for (const handler of listeners.get('message') ?? []) {
        handler(event);
      }
    },
    _listeners: listeners,
  };
}

let mockPort: ReturnType<typeof createMockPort>;

function createMockAudioContext() {
  return {
    sampleRate: 44100,
    audioWorklet: {
      addModule: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as AudioContext;
}

// Mock AudioWorkletNode globally
const OriginalAudioWorkletNode = globalThis.AudioWorkletNode;

beforeEach(() => {
  mockPort = createMockPort();
  // Must be a regular function (not arrow) to support `new` in Vitest v4
  globalThis.AudioWorkletNode = vi.fn().mockImplementation(function () {
    return {
      port: mockPort,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }) as unknown as typeof AudioWorkletNode;
});

afterEach(() => {
  globalThis.AudioWorkletNode = OriginalAudioWorkletNode;
});

describe('WorkletRecorder', () => {
  describe('initialize', () => {
    it('loads the worklet module via audioWorklet.addModule', async () => {
      const ctx = createMockAudioContext();
      const recorder = new WorkletRecorder(ctx);

      await recorder.initialize();

      expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — subsequent calls are no-ops', async () => {
      const ctx = createMockAudioContext();
      const recorder = new WorkletRecorder(ctx);

      await recorder.initialize();
      await recorder.initialize();

      expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    });
  });

  describe('input', () => {
    it('returns an AudioWorkletNode', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());

      const node = recorder.input;

      expect(node).toBeDefined();
      expect(AudioWorkletNode).toHaveBeenCalledTimes(1);
    });

    it('reuses the same node on subsequent accesses', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());

      const first = recorder.input;
      const second = recorder.input;

      expect(first).toBe(second);
      expect(AudioWorkletNode).toHaveBeenCalledTimes(1);
    });
  });

  describe('state', () => {
    it('starts as stopped', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());

      expect(recorder.state).toBe('stopped');
    });

    it('transitions to started after start()', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());

      recorder.start();

      expect(recorder.state).toBe('started');
    });

    it('transitions back to stopped after stop()', async () => {
      const recorder = new WorkletRecorder(createMockAudioContext());
      recorder.start();

      const stopPromise = recorder.stop();
      // Simulate the processor acknowledging the stop
      mockPort._simulateMessage({ type: 'stopped', sampleCount: 0 });
      await stopPromise;

      expect(recorder.state).toBe('stopped');
    });
  });

  describe('start', () => {
    it('sends a start command to the processor port', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());

      recorder.start();

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'start',
      });
    });
  });

  describe('stop', () => {
    it('sends a stop command to the processor port', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());
      recorder.start();

      recorder.stop();

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'stop',
      });
    });

    it('resolves with an AudioBuffer', async () => {
      const recorder = new WorkletRecorder(createMockAudioContext());
      recorder.start();

      // Simulate receiving a chunk
      mockPort._simulateMessage({
        type: 'chunk',
        data: new Float32Array([0.1, 0.2, 0.3]),
      });

      const stopPromise = recorder.stop();
      mockPort._simulateMessage({ type: 'stopped', sampleCount: 3 });
      const result = await stopPromise;

      expect(result).toBeInstanceOf(AudioBuffer);
      expect(result.length).toBe(3);
      expect(result.sampleRate).toBe(44100);
    });

    it('merges multiple chunks into a single buffer', async () => {
      const recorder = new WorkletRecorder(createMockAudioContext());
      recorder.start();

      mockPort._simulateMessage({
        type: 'chunk',
        data: new Float32Array([0.1, 0.2]),
      });
      mockPort._simulateMessage({
        type: 'chunk',
        data: new Float32Array([0.3, 0.4, 0.5]),
      });

      const stopPromise = recorder.stop();
      mockPort._simulateMessage({ type: 'stopped', sampleCount: 5 });
      const result = await stopPromise;

      expect(result.length).toBe(5);
      const channelData = result.getChannelData(0);
      expect(channelData[0]).toBeCloseTo(0.1);
      expect(channelData[1]).toBeCloseTo(0.2);
      expect(channelData[2]).toBeCloseTo(0.3);
      expect(channelData[3]).toBeCloseTo(0.4);
      expect(channelData[4]).toBeCloseTo(0.5);
    });

    it('rejects when not recording', async () => {
      const recorder = new WorkletRecorder(createMockAudioContext());

      await expect(recorder.stop()).rejects.toThrow(
        'WorkletRecorder is not recording',
      );
    });
  });

  describe('dispose', () => {
    it('disconnects the node', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());
      const node = recorder.input;

      recorder.dispose();

      expect(
        (node as unknown as { disconnect: ReturnType<typeof vi.fn> })
          .disconnect,
      ).toHaveBeenCalled();
    });

    it('resets recording state', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());
      recorder.start();

      recorder.dispose();

      expect(recorder.state).toBe('stopped');
    });
  });

  describe('sampleRate', () => {
    it('returns the audio context sample rate', () => {
      const recorder = new WorkletRecorder(createMockAudioContext());

      expect(recorder.sampleRate).toBe(44100);
    });
  });
});
