import { vi } from 'vitest';
import InstrumentClassificationService from '../InstrumentClassificationService';

const mockComputeMelSpectrogram = vi.fn();

vi.mock('../melSpectrogram', () => ({
  computeMelSpectrogram: (...args: unknown[]) =>
    mockComputeMelSpectrogram(...args),
}));

const mockInferenceSessionCreate = vi.fn();

type MockTensorInstance = {
  type: string;
  data: Float32Array;
  dims: number[];
};

vi.mock('onnxruntime-web', () => {
  // Tensor must be a real constructor (not arrow function) to support `new`
  function MockTensor(
    this: MockTensorInstance,
    type: string,
    data: Float32Array,
    dims: number[],
  ) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
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

// Set up main-thread fallback mocks — returns 'electricguitar' as top Jamendo class.
// The real Discogs-EffNet model produces TWO outputs:
//   PartitionedCall:0 → [n, 400] (genre predictions)
//   PartitionedCall:1 → [n, 1280] (embeddings for downstream heads)
// The instrument classification head expects the 1280-dim embeddings.
// The voice/instrumental head detects vocal vs instrumental (defaults to instrumental).
function setupMainThreadMocks(): void {
  mockFetchModel.mockResolvedValue(new ArrayBuffer(8));

  const mockEffnetSession = {
    inputNames: ['melspectrogram'],
    run: vi.fn().mockResolvedValue({
      'PartitionedCall:0': {
        data: new Float32Array(400).fill(0.1),
        dims: [1, 400],
      },
      'PartitionedCall:1': {
        data: new Float32Array(1280).fill(0.5),
        dims: [1, 1280],
      },
    }),
  };
  const mockInstrumentSession = {
    inputNames: ['model_output'],
    run: vi.fn().mockResolvedValue({
      output: (() => {
        // 40 predictions, electricguitar (index 15) has highest score
        const data = new Float32Array(40).fill(0.1);
        data[15] = 0.85; // electricguitar
        return { data };
      })(),
    }),
  };
  const mockVoiceInstrumentalSession = {
    inputNames: ['model_output'],
    run: vi.fn().mockResolvedValue({
      output: (() => {
        // [instrumental, voice] — instrumental is dominant (no vocals)
        const data = new Float32Array([0.85, 0.15]);
        return { data, dims: [1, 2] };
      })(),
    }),
  };

  mockInferenceSessionCreate
    .mockResolvedValueOnce(mockEffnetSession)
    .mockResolvedValueOnce(mockInstrumentSession)
    .mockResolvedValueOnce(mockVoiceInstrumentalSession);

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

      expect(mockFetchModel).toHaveBeenCalledTimes(3);
      expect(mockInferenceSessionCreate).toHaveBeenCalledTimes(3);
    });

    it('selects the 1280-dim embedding output, not the 400-dim prediction output', async () => {
      const buffer = createAudioBuffer();

      // Force fallback to main thread
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      // The instrument head should receive 1280-dim embeddings, not 400-dim predictions.
      // The real Discogs-EffNet model produces two outputs:
      //   PartitionedCall:0 → [n, 400] (genre predictions)
      //   PartitionedCall:1 → [n, 1280] (embeddings)
      // If the code incorrectly picks the first output (400-dim), the instrument
      // head receives wrong-sized input and OrtRun() fails with:
      // "Got invalid dimensions for input: embeddings — index: 1 Got: 400 Expected: 1280"
      const instrumentSession =
        await mockInferenceSessionCreate.mock.results[1].value;
      const instrumentFeed = instrumentSession.run.mock.calls[0][0];
      const inputTensor = Object.values(
        instrumentFeed,
      )[0] as MockTensorInstance;
      expect(inputTensor.dims).toEqual([1, 1280]);
    });

    it('uses session inputNames for ONNX feed keys', async () => {
      const buffer = createAudioBuffer();

      // Force fallback
      const promise = service.classify('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      // Retrieve the sessions that were created
      const effnetSession =
        await mockInferenceSessionCreate.mock.results[0].value;
      const instrumentSession =
        await mockInferenceSessionCreate.mock.results[1].value;

      // EffNet should use its inputNames[0] ('melspectrogram') as the feed key
      const effnetFeed = effnetSession.run.mock.calls[0][0];
      expect(effnetFeed).toHaveProperty('melspectrogram');
      expect(effnetFeed).not.toHaveProperty('model_input');

      // Instrument head should use its inputNames[0] ('model_output') as the feed key
      const instrumentFeed = instrumentSession.run.mock.calls[0][0];
      expect(instrumentFeed).toHaveProperty('model_output');
      expect(instrumentFeed).not.toHaveProperty('model_input');
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
      expect(mockFetchModel).toHaveBeenCalledTimes(3);
      expect(mockInferenceSessionCreate).toHaveBeenCalledTimes(3);
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

  describe('silence trimming', () => {
    it('trims leading silence before sending to the worker', async () => {
      // 5 seconds at 16kHz: 1s silence + 4s signal
      const length = 80000;
      const channelData = new Float32Array(length);
      // Fill samples 16000–80000 with audible signal
      for (let i = 16000; i < length; i++) {
        channelData[i] = 0.5 * Math.sin(i * 0.1);
      }
      const buffer = {
        numberOfChannels: 1,
        length,
        sampleRate: 16000,
        duration: length / 16000,
        getChannelData: () => channelData,
      } as unknown as AudioBuffer;

      const promise = service.classify('track-trim', buffer);
      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      // Trimmed length should be less than the original
      expect(postedMessage.length).toBeLessThan(length);
      // Should be approximately 4 seconds (within a 10ms window tolerance)
      expect(postedMessage.length).toBeGreaterThanOrEqual(63000);
    });

    it('trims trailing silence before sending to the worker', async () => {
      // 5 seconds at 16kHz: 4s signal + 1s silence
      const length = 80000;
      const channelData = new Float32Array(length);
      // Fill samples 0–64000 with audible signal
      for (let i = 0; i < 64000; i++) {
        channelData[i] = 0.5 * Math.sin(i * 0.1);
      }
      const buffer = {
        numberOfChannels: 1,
        length,
        sampleRate: 16000,
        duration: length / 16000,
        getChannelData: () => channelData,
      } as unknown as AudioBuffer;

      const promise = service.classify('track-trim', buffer);
      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.length).toBeLessThan(length);
      expect(postedMessage.length).toBeGreaterThanOrEqual(63000);
    });

    it('sends full audio when there is no silence to trim', async () => {
      // 3 seconds at 16kHz filled with signal
      const length = 48000;
      const channelData = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        channelData[i] = 0.5 * Math.sin(i * 0.1);
      }
      const buffer = {
        numberOfChannels: 1,
        length,
        sampleRate: 16000,
        duration: length / 16000,
        getChannelData: () => channelData,
      } as unknown as AudioBuffer;

      const promise = service.classify('track-full', buffer);
      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.length).toBe(length);
    });

    it('sends full audio when the entire buffer is silent', async () => {
      // 3 seconds of silence at 16kHz
      const buffer = createAudioBuffer(1, 48000, 16000);

      const promise = service.classify('track-silent', buffer);
      simulateWorkerResult('electricguitar', 0.85);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.length).toBe(48000);
    });

    it('returns unknown when trimmed audio is too short for classification', async () => {
      // 3 seconds at 16kHz: 2s silence + 1s signal + leftover silence
      // After trimming, ~1s remains which is below MIN_AUDIO_DURATION_SECONDS
      const length = 48000;
      const channelData = new Float32Array(length);
      // Only fill a short burst (0.5s) in the middle
      for (let i = 24000; i < 32000; i++) {
        channelData[i] = 0.5 * Math.sin(i * 0.1);
      }
      const buffer = {
        numberOfChannels: 1,
        length,
        sampleRate: 16000,
        duration: length / 16000,
        getChannelData: () => channelData,
      } as unknown as AudioBuffer;

      const label = await service.classify('track-short-trim', buffer);

      expect(label).toBe('unknown');
      expect(service.getClassificationState('track-short-trim')).toBe('done');
    });
  });

  describe('vocal classification', () => {
    it('classifies as vocals when voice/instrumental head detects voice', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-vocal', buffer);

      // Worker returns 'drums' from the instrument head — but the real pipeline
      // should detect vocals via the voice/instrumental head and override.
      simulateWorkerResult('voice', 0.92);
      const label = await promise;

      expect(label).toBe('vocals');
      expect(service.getClassification('track-vocal')?.label).toBe('vocals');
    });

    it('uses instrument head prediction when voice/instrumental head detects instrumental', async () => {
      const buffer = createAudioBuffer();
      const promise = service.classify('track-instrument', buffer);

      simulateWorkerResult('drums', 0.85);
      const label = await promise;

      expect(label).toBe('drums');
    });

    it('classifies as vocals on main-thread fallback when voice/instrumental head detects voice', async () => {
      // Override instrument session to return 'drums' as top instrument prediction,
      // but voice/instrumental session to detect voice
      mockInferenceSessionCreate.mockReset();
      mockFetchModel.mockResolvedValue(new ArrayBuffer(8));

      const mockEffnetSession = {
        inputNames: ['melspectrogram'],
        run: vi.fn().mockResolvedValue({
          'PartitionedCall:0': {
            data: new Float32Array(400).fill(0.1),
            dims: [1, 400],
          },
          'PartitionedCall:1': {
            data: new Float32Array(1280).fill(0.5),
            dims: [1, 1280],
          },
        }),
      };
      const mockInstrumentSession = {
        inputNames: ['model_output'],
        run: vi.fn().mockResolvedValue({
          output: (() => {
            // 40 predictions, drums (index 14) has highest score
            const data = new Float32Array(40).fill(0.1);
            data[14] = 0.85; // drums
            return { data };
          })(),
        }),
      };
      const mockVoiceInstrumentalSession = {
        inputNames: ['model_output'],
        run: vi.fn().mockResolvedValue({
          output: (() => {
            // [instrumental, voice] — voice is dominant
            const data = new Float32Array([0.15, 0.85]);
            return { data, dims: [1, 2] };
          })(),
        }),
      };

      mockInferenceSessionCreate
        .mockResolvedValueOnce(mockEffnetSession)
        .mockResolvedValueOnce(mockInstrumentSession)
        .mockResolvedValueOnce(mockVoiceInstrumentalSession);

      const patch = new Float32Array(128 * 96).fill(0.5);
      mockComputeMelSpectrogram.mockResolvedValue([patch]);

      const buffer = createAudioBuffer();
      const promise = service.classify('track-vocal', buffer);

      // Force fallback to main thread
      simulateWorkerError('Worker failed');
      const label = await promise;

      expect(label).toBe('vocals');
    });
  });

  describe('sequential session execution', () => {
    it('runs classification heads sequentially to avoid ONNX "Session already started" error', async () => {
      // ONNX Runtime Web's WASM backend (numThreads=1) cannot handle
      // concurrent run() calls — even across different sessions — because
      // they share a single WASM inference runner. If two sessions run in
      // parallel via Promise.all, the second one rejects with
      // "Session already started". The fix is to run them sequentially.
      mockInferenceSessionCreate.mockReset();
      mockFetchModel.mockResolvedValue(new ArrayBuffer(8));

      let activeSessions = 0;

      // Simulate ONNX RT behavior: reject if another session is already running
      function createConcurrencyGuardedRun(
        result: Record<string, unknown>,
      ): ReturnType<typeof vi.fn> {
        return vi.fn().mockImplementation(() => {
          activeSessions++;
          if (activeSessions > 1) {
            activeSessions--;
            return Promise.reject(new Error('Session already started'));
          }
          return new Promise((resolve) => {
            setTimeout(() => {
              activeSessions--;
              resolve(result);
            }, 0);
          });
        });
      }

      const mockEffnetSession = {
        inputNames: ['melspectrogram'],
        run: createConcurrencyGuardedRun({
          'PartitionedCall:0': {
            data: new Float32Array(400).fill(0.1),
            dims: [1, 400],
          },
          'PartitionedCall:1': {
            data: new Float32Array(1280).fill(0.5),
            dims: [1, 1280],
          },
        }),
      };
      const mockInstrumentSession = {
        inputNames: ['model_output'],
        run: createConcurrencyGuardedRun({
          output: (() => {
            const data = new Float32Array(40).fill(0.1);
            data[15] = 0.85;
            return { data };
          })(),
        }),
      };
      const mockVoiceInstrumentalSession = {
        inputNames: ['model_output'],
        run: createConcurrencyGuardedRun({
          output: {
            data: new Float32Array([0.85, 0.15]),
            dims: [1, 2],
          },
        }),
      };

      mockInferenceSessionCreate
        .mockResolvedValueOnce(mockEffnetSession)
        .mockResolvedValueOnce(mockInstrumentSession)
        .mockResolvedValueOnce(mockVoiceInstrumentalSession);

      const patch = new Float32Array(128 * 96).fill(0.5);
      mockComputeMelSpectrogram.mockResolvedValue([patch]);

      const buffer = createAudioBuffer();
      const promise = service.classify('track-1', buffer);

      // Force fallback to main thread where we control the mock sessions
      simulateWorkerError('Worker failed');
      const label = await promise;

      expect(label).toBe('guitar');
      expect(mockInstrumentSession.run).toHaveBeenCalledTimes(1);
      expect(mockVoiceInstrumentalSession.run).toHaveBeenCalledTimes(1);
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
