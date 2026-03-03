import { vi } from 'vitest';
import WorkletAnalyser from '../WorkletAnalyser';

// --- AudioWorkletNode mock ---

type MessageHandler = (event: MessageEvent) => void;

function createMockPort() {
  let onmessageHandler: MessageHandler | null = null;
  return {
    postMessage: vi.fn(),
    get onmessage() {
      return onmessageHandler;
    },
    set onmessage(handler: MessageHandler | null) {
      onmessageHandler = handler;
    },
    // Test helper: simulate a message from the processor
    _simulateMessage(data: unknown) {
      if (onmessageHandler) {
        onmessageHandler({ data } as MessageEvent);
      }
    },
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

describe('WorkletAnalyser', () => {
  describe('initialize', () => {
    it('loads the worklet module', async () => {
      const ctx = createMockAudioContext();
      const analyser = new WorkletAnalyser(ctx);

      await analyser.initialize();

      expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    });

    it('is idempotent', async () => {
      const ctx = createMockAudioContext();
      const analyser = new WorkletAnalyser(ctx);

      await analyser.initialize();
      await analyser.initialize();

      expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    });
  });

  describe('input', () => {
    it('returns an AudioWorkletNode', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());

      const node = analyser.input;

      expect(node).toBeDefined();
      expect(AudioWorkletNode).toHaveBeenCalledTimes(1);
    });

    it('reuses the same node on subsequent accesses', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());

      const first = analyser.input;
      const second = analyser.input;

      expect(first).toBe(second);
      expect(AudioWorkletNode).toHaveBeenCalledTimes(1);
    });

    it('sends initial smoothing configuration', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext(), 0.9);

      void analyser.input;

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'configure',
        smoothing: 0.9,
      });
    });
  });

  describe('getLoudness', () => {
    it('returns 0 before any messages', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());

      expect(analyser.getLoudness()).toBe(0);
    });

    it('returns the power-curved RMS value after receiving a message', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());
      void analyser.input; // trigger node creation

      mockPort._simulateMessage({ type: 'loudness', rms: 0.5 });

      // Power curve: Math.pow(0.5, 0.6) ≈ 0.6598
      expect(analyser.getLoudness()).toBeCloseTo(Math.pow(0.5, 0.6), 4);
    });

    it('clamps negative RMS to zero', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());
      void analyser.input;

      mockPort._simulateMessage({ type: 'loudness', rms: -0.1 });

      expect(analyser.getLoudness()).toBe(0);
    });
  });

  describe('getRawRms', () => {
    it('returns the raw RMS without power curve', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());
      void analyser.input;

      mockPort._simulateMessage({ type: 'loudness', rms: 0.5 });

      expect(analyser.getRawRms()).toBe(0.5);
    });

    it('clamps negative values to zero', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());
      void analyser.input;

      mockPort._simulateMessage({ type: 'loudness', rms: -0.1 });

      expect(analyser.getRawRms()).toBe(0);
    });
  });

  describe('dispose', () => {
    it('disconnects the node', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());
      const node = analyser.input;

      analyser.dispose();

      expect(
        (node as unknown as { disconnect: ReturnType<typeof vi.fn> })
          .disconnect,
      ).toHaveBeenCalled();
    });

    it('resets loudness to zero', () => {
      const analyser = new WorkletAnalyser(createMockAudioContext());
      void analyser.input;
      mockPort._simulateMessage({ type: 'loudness', rms: 0.8 });

      analyser.dispose();

      expect(analyser.getLoudness()).toBe(0);
    });
  });
});
