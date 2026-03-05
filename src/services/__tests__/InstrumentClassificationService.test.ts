import { vi } from 'vitest';
import InstrumentClassificationService from '../InstrumentClassificationService';

const mockClassifier = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(mockClassifier),
}));

function createAudioBuffer(
  numberOfChannels = 1,
  length = 48000,
  sampleRate = 48000,
): AudioBuffer {
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    channelData.push(new Float32Array(length));
  }
  return {
    numberOfChannels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channelData[ch],
  } as unknown as AudioBuffer;
}

type MockWorker = {
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate: ReturnType<typeof vi.fn>;
};

let mockWorker: MockWorker;

// Must be a regular function (not arrow) to support `new` in Vitest v4
vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(function () {
    mockWorker = {
      postMessage: vi.fn(),
      onmessage: null,
      onerror: null,
      terminate: vi.fn(),
    };
    return mockWorker;
  }),
);

function simulateWorkerResult(label: string, score: number, id = 0): void {
  mockWorker.onmessage!({
    data: { id, type: 'result', label, score },
  } as MessageEvent);
}

function simulateWorkerError(message: string, id = 0): void {
  mockWorker.onmessage!({
    data: { id, type: 'error', message },
  } as MessageEvent);
}

let service: InstrumentClassificationService;

beforeEach(() => {
  service = new InstrumentClassificationService();
  mockClassifier.mockReset();
  mockClassifier.mockResolvedValue([
    { label: 'guitar', score: 0.85 },
    { label: 'vocals', score: 0.1 },
    { label: 'drums', score: 0.05 },
  ]);
});

describe('InstrumentClassificationService', () => {
  describe('initial state', () => {
    it('starts with empty classifications', () => {
      expect(service.classifications.size).toBe(0);
    });

    it('returns undefined for unknown track', () => {
      expect(service.getClassification('unknown')).toBeUndefined();
    });

    it('returns idle state for unknown track', () => {
      expect(service.getClassificationState('unknown')).toBe('idle');
    });
  });

  describe('worker-based classification', () => {
    it('creates a Worker on first classify call', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('guitar', 0.85);
      await promise;

      expect(Worker).toHaveBeenCalledWith(expect.any(URL), {
        type: 'module',
      });
    });

    it('reuses the same Worker across multiple classify calls', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.classify('track-1', buffer);
      simulateWorkerResult('guitar', 0.85, 0);
      await promise1;

      const promise2 = service.classify('track-2', buffer);
      simulateWorkerResult('drums', 0.8, 1);
      await promise2;

      expect(Worker).toHaveBeenCalledTimes(1);
    });

    it('posts channel data, sampleRate, and length to the worker', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('guitar', 0.85);
      await promise;

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 0,
          type: 'classify',
          sampleRate: 48000,
          length: 48000,
        }),
        expect.any(Array),
      );

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.channelData).toHaveLength(1);
      expect(postedMessage.channelData[0]).toBeInstanceOf(Float32Array);
    });

    it('transfers channel data ArrayBuffers to avoid copying', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('guitar', 0.85);
      await promise;

      const transferables = mockWorker.postMessage.mock.calls[0][1];
      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBeInstanceOf(ArrayBuffer);
    });

    it('copies channel data before transfer to preserve the original AudioBuffer', async () => {
      const originalData = new Float32Array([0.1, 0.2, 0.3]);
      const buffer = {
        numberOfChannels: 1,
        length: 3,
        sampleRate: 48000,
        duration: 3 / 48000,
        getChannelData: vi.fn().mockReturnValue(originalData),
      } as unknown as AudioBuffer;

      const promise = service.classify('track-1', buffer);

      const postedChannelData =
        mockWorker.postMessage.mock.calls[0][0].channelData[0];
      expect(postedChannelData).not.toBe(originalData);
      expect(Array.from(postedChannelData)).toEqual(Array.from(originalData));

      simulateWorkerResult('guitar', 0.85);
      await promise;
    });

    it('extracts all channels for multi-channel audio', async () => {
      const buffer = createAudioBuffer(2, 48000, 48000);
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('guitar', 0.85);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.channelData).toHaveLength(2);
    });

    it('returns the label from the worker response', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('guitar', 0.85);
      const label = await promise;

      expect(label).toBe('guitar');
    });

    it('stores the result in the classifications signal', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('guitar', 0.85);
      await promise;

      const result = service.getClassification('track-1');
      expect(result).toEqual({ label: 'guitar', score: 0.85 });
    });

    it('sets state to done after classification', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('guitar', 0.85);
      await promise;

      expect(service.getClassificationState('track-1')).toBe('done');
    });

    it('returns cached result without re-running inference', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.classify('track-1', buffer);
      simulateWorkerResult('guitar', 0.85);
      await promise1;

      const label = await service.classify('track-1', buffer);

      expect(label).toBe('guitar');
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);
    });

    it('classifies multiple tracks independently', async () => {
      const buffer1 = createAudioBuffer();
      const buffer2 = createAudioBuffer();

      const promise1 = service.classify('track-1', buffer1);
      simulateWorkerResult('guitar', 0.9, 0);
      await promise1;

      const promise2 = service.classify('track-2', buffer2);
      simulateWorkerResult('drums', 0.8, 1);
      await promise2;

      expect(service.getClassification('track-1')?.label).toBe('guitar');
      expect(service.getClassification('track-2')?.label).toBe('drums');
      expect(service.classifications.size).toBe(2);
    });

    it('assigns sequential message IDs', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.classify('track-1', buffer);
      simulateWorkerResult('guitar', 0.85, 0);
      await promise1;

      const promise2 = service.classify('track-2', buffer);
      simulateWorkerResult('drums', 0.8, 1);
      await promise2;

      expect(mockWorker.postMessage.mock.calls[0][0].id).toBe(0);
      expect(mockWorker.postMessage.mock.calls[1][0].id).toBe(1);
    });
  });

  describe('worker error handling', () => {
    it('falls back to main thread when the worker responds with an error', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerError('Pipeline initialization failed');
      await promise;

      // Should have fallen back to main-thread pipeline
      const { pipeline } = await import('@huggingface/transformers');
      expect(pipeline).toHaveBeenCalled();
      expect(service.getClassification('track-1')?.label).toBe('guitar');
    });

    it('sets state to error when both worker and main thread fail', async () => {
      mockClassifier.mockRejectedValue(new Error('model error'));
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerError('Worker failed');

      await expect(promise).rejects.toThrow(
        'Classification failed for track track-1',
      );
      expect(service.getClassificationState('track-1')).toBe('error');
    });

    it('uses main thread directly after worker has failed once', async () => {
      const buffer = createAudioBuffer();

      // First call — worker error triggers fallback
      const promise1 = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise1;

      // Second call — should go directly to main thread (no worker message)
      const postMessageCallCount = mockWorker.postMessage.mock.calls.length;
      await service.classify('track-2', buffer);

      expect(mockWorker.postMessage.mock.calls.length).toBe(
        postMessageCallCount,
      );
    });
  });

  describe('main-thread fallback', () => {
    it('passes candidate labels to the pipeline', async () => {
      const buffer = createAudioBuffer();

      // Force fallback by triggering worker error
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      expect(mockClassifier).toHaveBeenCalledWith(
        expect.any(Float32Array),
        expect.arrayContaining([
          'vocals',
          'guitar',
          'bass',
          'drums',
          'keyboard',
          'strings',
          'brass',
          'woodwind',
          'synth',
          'percussion',
        ]),
      );
    });

    it('downmixes stereo to mono', async () => {
      const buffer = createAudioBuffer(2, 48000, 48000);

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      const passedAudio = mockClassifier.mock.calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });

    it('resamples from 44100 to 48000', async () => {
      const buffer = createAudioBuffer(1, 44100, 44100);

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      const passedAudio = mockClassifier.mock.calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });

    it('does not resample when already at target rate', async () => {
      const buffer = createAudioBuffer(1, 48000, 48000);

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      const passedAudio = mockClassifier.mock.calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });

    it('loads the pipeline lazily on first classify call', async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const buffer = createAudioBuffer();

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      expect(pipeline).toHaveBeenCalledWith(
        'zero-shot-audio-classification',
        'Xenova/clap-large',
        { device: 'wasm' },
      );
    });

    it('reuses the pipeline across multiple calls', async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const buffer = createAudioBuffer();

      // Force fallback
      const promise1 = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise1;

      mockClassifier.mockResolvedValueOnce([{ label: 'bass', score: 0.9 }]);
      await service.classify('track-2', buffer);

      expect(pipeline).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeClassification', () => {
    it('removes a classification entry', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);
      simulateWorkerResult('guitar', 0.85);
      await promise;

      service.removeClassification('track-1');

      expect(service.getClassification('track-1')).toBeUndefined();
      expect(service.getClassificationState('track-1')).toBe('idle');
      expect(service.classifications.size).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all classifications', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.classify('track-1', buffer);
      simulateWorkerResult('guitar', 0.85, 0);
      await promise1;

      const promise2 = service.classify('track-2', buffer);
      simulateWorkerResult('drums', 0.8, 1);
      await promise2;

      service.reset();

      expect(service.classifications.size).toBe(0);
    });
  });
});
