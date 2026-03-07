import { vi } from 'vitest';
import InstrumentClassificationService from '../InstrumentClassificationService';

const mockComputeMelSpectrogram = vi.fn();

vi.mock('../melSpectrogram', () => ({
  computeMelSpectrogram: (...args: unknown[]) =>
    mockComputeMelSpectrogram(...args),
}));

const mockInferenceSessionCreate = vi.fn();

vi.mock('onnxruntime-web', () => {
  // Tensor must be a real constructor (not arrow function) to support `new`
  function MockTensor() {}
  return {
    InferenceSession: {
      create: (...args: unknown[]) => mockInferenceSessionCreate(...args),
    },
    Tensor: MockTensor,
    env: { wasm: { numThreads: 1 } },
  };
});

const mockFetchModel = vi.fn();

vi.mock('../ModelCache', () => ({
  fetchModel: (...args: unknown[]) => mockFetchModel(...args),
}));

function createAudioBuffer(
  numberOfChannels = 1,
  length = 48000,
  sampleRate = 16000,
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

function simulateDownloadProgress(progress: number): void {
  mockWorker.onmessage!({
    data: { type: 'download-progress', progress },
  } as MessageEvent);
}

// Set up main-thread fallback mocks — returns 'electricguitar' as top Jamendo class
function setupMainThreadMocks(): void {
  mockFetchModel.mockResolvedValue(new ArrayBuffer(8));

  const mockEffnetSession = {
    run: vi.fn().mockResolvedValue({
      output: {
        data: new Float32Array(1280).fill(0.5),
        dims: [1, 1280],
      },
    }),
  };
  const mockInstrumentSession = {
    run: vi.fn().mockResolvedValue({
      output: (() => {
        // 40 predictions, electricguitar (index 15) has highest score
        const data = new Float32Array(40).fill(0.1);
        data[15] = 0.85; // electricguitar
        return { data };
      })(),
    }),
  };

  mockInferenceSessionCreate
    .mockResolvedValueOnce(mockEffnetSession)
    .mockResolvedValueOnce(mockInstrumentSession);

  // computeMelSpectrogram returns one patch
  const patch = new Float32Array(128 * 96).fill(0.5);
  mockComputeMelSpectrogram.mockResolvedValue([patch]);
}

let service: InstrumentClassificationService;

beforeEach(() => {
  service = new InstrumentClassificationService();
  mockComputeMelSpectrogram.mockReset();
  mockInferenceSessionCreate.mockReset();
  mockFetchModel.mockReset();
  setupMainThreadMocks();
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

    it('starts with null download progress', () => {
      expect(service.downloadProgress).toBeNull();
    });
  });

  describe('worker-based classification', () => {
    it('creates a Worker on first classify call', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      expect(Worker).toHaveBeenCalledWith(expect.any(URL), {
        type: 'module',
      });
    });

    it('reuses the same Worker across multiple classify calls', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.classify('track-1', buffer);
      simulateWorkerResult('electricguitar', 0.85, 0);
      await promise1;

      const promise2 = service.classify('track-2', buffer);
      simulateWorkerResult('drums', 0.8, 1);
      await promise2;

      expect(Worker).toHaveBeenCalledTimes(1);
    });

    it('posts channel data, sampleRate, and length to the worker', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 0,
          type: 'classify',
          sampleRate: 16000,
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

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      const transferables = mockWorker.postMessage.mock.calls[0][1];
      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBeInstanceOf(ArrayBuffer);
    });

    it('copies channel data before transfer to preserve the original AudioBuffer', async () => {
      const originalData = new Float32Array(48000).fill(0.5);
      const buffer = {
        numberOfChannels: 1,
        length: 48000,
        sampleRate: 16000,
        duration: 3,
        getChannelData: vi.fn().mockReturnValue(originalData),
      } as unknown as AudioBuffer;

      const promise = service.classify('track-1', buffer);

      const postedChannelData =
        mockWorker.postMessage.mock.calls[0][0].channelData[0];
      // The posted data is a copy, not the same reference
      expect(postedChannelData).not.toBe(originalData);
      expect(postedChannelData.length).toBe(originalData.length);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;
    });

    it('extracts all channels for multi-channel audio', async () => {
      const buffer = createAudioBuffer(2, 48000, 16000);
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.channelData).toHaveLength(2);
    });

    it('maps Jamendo class labels to instrument categories', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      const label = await promise;

      expect(label).toBe('guitar');
    });

    it('stores the mapped result in the classifications signal', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      const result = service.getClassification('track-1');
      expect(result).toEqual({ label: 'guitar', score: 0.85 });
    });

    it('sets state to done after classification', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      expect(service.getClassificationState('track-1')).toBe('done');
    });

    it('returns cached result without re-running inference', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.classify('track-1', buffer);
      simulateWorkerResult('electricguitar', 0.85);
      await promise1;

      const label = await service.classify('track-1', buffer);

      expect(label).toBe('guitar');
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);
    });

    it('classifies multiple tracks independently', async () => {
      const buffer1 = createAudioBuffer();
      const buffer2 = createAudioBuffer();

      const promise1 = service.classify('track-1', buffer1);
      simulateWorkerResult('electricguitar', 0.9, 0);
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
      simulateWorkerResult('electricguitar', 0.85, 0);
      await promise1;

      const promise2 = service.classify('track-2', buffer);
      simulateWorkerResult('drums', 0.8, 1);
      await promise2;

      expect(mockWorker.postMessage.mock.calls[0][0].id).toBe(0);
      expect(mockWorker.postMessage.mock.calls[1][0].id).toBe(1);
    });
  });

  describe('download progress', () => {
    it('updates download progress when the worker reports it', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateDownloadProgress(45);

      expect(service.downloadProgress).toBe(45);

      // Resolve the pending classify to avoid dangling promise
      simulateWorkerResult('electricguitar', 0.85);
      await promise;
    });

    it('clears download progress when classification result arrives', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateDownloadProgress(75);
      expect(service.downloadProgress).toBe(75);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      expect(service.downloadProgress).toBeNull();
    });

    it('clears download progress on worker error', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateDownloadProgress(50);

      // Trigger onerror (catastrophic worker failure) — rejects all pending
      // requests and falls back to main-thread inference.
      mockWorker.onerror!({} as ErrorEvent);
      await promise;

      expect(service.downloadProgress).toBeNull();
    });
  });

  describe('worker error handling', () => {
    it('falls back to main thread when the worker crashes (onerror)', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      // Simulate catastrophic worker failure (e.g., module failed to load)
      mockWorker.onerror!({} as ErrorEvent);
      await promise;

      // Should have fallen back to main-thread ONNX pipeline
      expect(mockFetchModel).toHaveBeenCalled();
      expect(service.getClassification('track-1')?.label).toBe('guitar');
    });

    it('falls back to main thread when the worker responds with an error', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      simulateWorkerError('Pipeline initialization failed');
      await promise;

      // Should have fallen back to main-thread ONNX pipeline
      expect(mockFetchModel).toHaveBeenCalled();
      expect(service.getClassification('track-1')?.label).toBe('guitar');
    });

    it('sets state to error when both worker and main thread fail', async () => {
      mockFetchModel.mockRejectedValue(new Error('model error'));
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

      // Reset mocks for second call — classifier is reused, so sessions
      // don't need to be re-created
      mockComputeMelSpectrogram.mockResolvedValueOnce([
        new Float32Array(128 * 96).fill(0.5),
      ]);
      await service.classify('track-2', buffer);

      expect(mockWorker.postMessage.mock.calls.length).toBe(
        postMessageCallCount,
      );
    });
  });

  describe('main-thread fallback', () => {
    it('downmixes stereo to mono', async () => {
      const buffer = createAudioBuffer(2, 48000, 16000);

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      // computeMelSpectrogram should receive mono audio of original length
      const passedAudio = mockComputeMelSpectrogram.mock
        .calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });

    it('resamples from 44100 to 16000', async () => {
      // 3 seconds at 44100 Hz = 132300 samples
      const buffer = createAudioBuffer(1, 132300, 44100);

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      const passedAudio = mockComputeMelSpectrogram.mock
        .calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });

    it('does not resample when already at target rate', async () => {
      const buffer = createAudioBuffer(1, 48000, 16000);

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      const passedAudio = mockComputeMelSpectrogram.mock
        .calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });

    it('loads ONNX models on first classify call', async () => {
      const buffer = createAudioBuffer();

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      expect(mockFetchModel).toHaveBeenCalledTimes(2);
      expect(mockInferenceSessionCreate).toHaveBeenCalledTimes(2);
    });

    it('reuses the pipeline across multiple calls', async () => {
      const buffer = createAudioBuffer();

      // Force fallback
      const promise1 = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise1;

      // Reset mel spectrogram mock for second call
      mockComputeMelSpectrogram.mockResolvedValueOnce([
        new Float32Array(128 * 96).fill(0.5),
      ]);
      await service.classify('track-2', buffer);

      // Models fetched and sessions created only once
      expect(mockFetchModel).toHaveBeenCalledTimes(2);
      expect(mockInferenceSessionCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('short audio handling', () => {
    it('skips classification for audio shorter than the minimum duration', async () => {
      // At 16kHz, 16000 samples = 1 second — too short for a 128-frame patch
      // (needs ~2.08 seconds at 16kHz)
      const buffer = createAudioBuffer(1, 16000, 16000);

      const label = await service.classify('track-short', buffer);

      expect(label).toBe('unknown');
      expect(service.getClassificationState('track-short')).toBe('done');
      expect(service.getClassification('track-short')).toEqual({
        label: 'unknown',
        score: 0,
      });
    });

    it('skips classification for short audio at higher sample rates', async () => {
      // 44100 samples at 44100 Hz = 1 second — still too short after
      // resampling to 16kHz
      const buffer = createAudioBuffer(1, 44100, 44100);

      const label = await service.classify('track-short', buffer);

      expect(label).toBe('unknown');
      expect(service.getClassificationState('track-short')).toBe('done');
    });

    it('classifies audio that meets the minimum duration', async () => {
      // 3 seconds at 16kHz — long enough for at least one patch
      const buffer = createAudioBuffer(1, 48000, 16000);
      const promise = service.classify('track-ok', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      expect(service.getClassificationState('track-ok')).toBe('done');
      expect(service.getClassification('track-ok')?.label).toBe('guitar');
    });
  });

  describe('loudest excerpt extraction', () => {
    it('sends only a 5-second excerpt to the worker for long audio', async () => {
      // 30 seconds at 16kHz
      const buffer = createAudioBuffer(1, 480000, 16000);
      const promise = service.classify('track-long', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      // Should have sent a 5-second excerpt (80000 samples at 16kHz)
      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.length).toBe(80000);
    });

    it('sends the full audio when shorter than the excerpt duration', async () => {
      // 3 seconds at 16kHz — shorter than the 5-second excerpt
      const buffer = createAudioBuffer(1, 48000, 16000);
      const promise = service.classify('track-short-ok', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.length).toBe(48000);
    });

    it('picks the loudest segment from long audio', async () => {
      // Create 10 seconds at 16kHz with a loud section at seconds 3-5
      const length = 160000;
      const channelData = new Float32Array(length);
      // Fill seconds 3-5 (samples 48000-80000) with loud signal
      for (let i = 48000; i < 80000; i++) {
        channelData[i] = 0.9 * Math.sin(i * 0.1);
      }
      const buffer = {
        numberOfChannels: 1,
        length,
        sampleRate: 16000,
        duration: length / 16000,
        getChannelData: () => channelData,
      } as unknown as AudioBuffer;

      const promise = service.classify('track-loud', buffer);

      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      // The 5-second excerpt should overlap with the loud section (samples 48000-80000)
      const postedData = mockWorker.postMessage.mock.calls[0][0].channelData[0];
      const excerptEnergy = postedData.reduce(
        (sum: number, v: number) => sum + v * v,
        0,
      );
      // The excerpt should have significant energy (from the loud section)
      expect(excerptEnergy).toBeGreaterThan(0);
    });
  });

  describe('removeClassification', () => {
    it('removes a classification entry', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);
      simulateWorkerResult('electricguitar', 0.85);
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
      simulateWorkerResult('electricguitar', 0.85, 0);
      await promise1;

      const promise2 = service.classify('track-2', buffer);
      simulateWorkerResult('drums', 0.8, 1);
      await promise2;

      service.reset();

      expect(service.classifications.size).toBe(0);
    });
  });
});
