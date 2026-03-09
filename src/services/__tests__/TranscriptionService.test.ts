import { vi } from 'vitest';
import TranscriptionService from '../TranscriptionService';
import type { TranscriptionSegment } from '../../types/transcription';

// Mock @huggingface/transformers for main-thread fallback tests
const mockTranscriberFn = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi
    .fn()
    .mockImplementation(() => Promise.resolve(mockTranscriberFn)),
  env: { allowLocalModels: true },
}));

type MockWorker = {
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate: ReturnType<typeof vi.fn>;
};

let mockWorker: MockWorker;

// Must be a regular function (not arrow) to support `new` in Vitest
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

const sampleSegments: TranscriptionSegment[] = [
  {
    text: 'Hello world',
    start: 0.0,
    end: 1.5,
    words: [
      { text: 'Hello', start: 0.0, end: 0.7 },
      { text: 'world', start: 0.8, end: 1.5 },
    ],
  },
];

function simulateWorkerResult(
  language: string,
  segments: TranscriptionSegment[],
  id = 0,
): void {
  mockWorker.onmessage!({
    data: { id, type: 'result', language, segments },
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

// Set up main-thread fallback mock — returns sample transcription result
function setupMainThreadMocks(): void {
  mockTranscriberFn.mockResolvedValue({
    language: 'en',
    chunks: [
      { text: ' Hello', timestamp: [0.0, 0.7] },
      { text: ' world', timestamp: [0.8, 1.5] },
    ],
  });
}

let service: TranscriptionService;

beforeEach(() => {
  service = new TranscriptionService();
  mockTranscriberFn.mockReset();
  setupMainThreadMocks();
});

describe('TranscriptionService', () => {
  describe('initial state', () => {
    it('starts with empty transcriptions', () => {
      expect(service.transcriptions.size).toBe(0);
    });

    it('returns undefined for unknown track', () => {
      expect(service.getTranscription('unknown')).toBeUndefined();
    });

    it('returns idle state for unknown track', () => {
      expect(service.getTranscriptionState('unknown')).toBe('idle');
    });

    it('starts with null download progress', () => {
      expect(service.downloadProgress).toBeNull();
    });

    it('uses default model ID when not specified', () => {
      expect(service.modelId).toBe('onnx-community/whisper-base_timestamped');
    });

    it('accepts a custom model ID', () => {
      const custom = new TranscriptionService('onnx-community/whisper-small');
      expect(custom.modelId).toBe('onnx-community/whisper-small');
    });
  });

  describe('worker-based transcription', () => {
    it('creates a Worker on first transcribe call', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateWorkerResult('en', sampleSegments);
      await promise;

      expect(Worker).toHaveBeenCalledWith(expect.any(URL), {
        type: 'module',
      });
    });

    it('reuses the same Worker across multiple transcribe calls', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.transcribe('track-1', buffer);
      simulateWorkerResult('en', sampleSegments, 0);
      await promise1;

      const promise2 = service.transcribe('track-2', buffer);
      simulateWorkerResult('en', sampleSegments, 1);
      await promise2;

      expect(Worker).toHaveBeenCalledTimes(1);
    });

    it('posts channel data, sampleRate, length, and modelId to the worker', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateWorkerResult('en', sampleSegments);
      await promise;

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 0,
          type: 'transcribe',
          sampleRate: 16000,
          length: 48000,
          modelId: 'onnx-community/whisper-base_timestamped',
        }),
        expect.any(Array),
      );

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.channelData).toHaveLength(1);
      expect(postedMessage.channelData[0]).toBeInstanceOf(Float32Array);
    });

    it('sends custom model ID to the worker', async () => {
      const custom = new TranscriptionService('onnx-community/whisper-small');
      const buffer = createAudioBuffer();
      const promise = custom.transcribe('track-1', buffer);

      simulateWorkerResult('en', sampleSegments);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.modelId).toBe('onnx-community/whisper-small');
    });

    it('transfers channel data ArrayBuffers to avoid copying', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateWorkerResult('en', sampleSegments);
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

      const promise = service.transcribe('track-1', buffer);

      const postedChannelData =
        mockWorker.postMessage.mock.calls[0][0].channelData[0];
      expect(postedChannelData).not.toBe(originalData);
      expect(postedChannelData.length).toBe(originalData.length);

      simulateWorkerResult('en', sampleSegments);
      await promise;
    });

    it('extracts all channels for multi-channel audio', async () => {
      const buffer = createAudioBuffer(2, 48000, 16000);
      const promise = service.transcribe('track-1', buffer);

      simulateWorkerResult('en', sampleSegments);
      await promise;

      const postedMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(postedMessage.channelData).toHaveLength(2);
    });

    it('stores the result in the transcriptions signal', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateWorkerResult('en', sampleSegments);
      await promise;

      const result = service.getTranscription('track-1');
      expect(result).toEqual({
        trackId: 'track-1',
        language: 'en',
        segments: sampleSegments,
      });
    });

    it('sets state to done after transcription', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateWorkerResult('en', sampleSegments);
      await promise;

      expect(service.getTranscriptionState('track-1')).toBe('done');
    });

    it('returns cached result without re-running inference', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.transcribe('track-1', buffer);
      simulateWorkerResult('en', sampleSegments);
      await promise1;

      const result = await service.transcribe('track-1', buffer);

      expect(result.language).toBe('en');
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);
    });

    it('transcribes multiple tracks independently', async () => {
      const buffer1 = createAudioBuffer();
      const buffer2 = createAudioBuffer();

      const otherSegments: TranscriptionSegment[] = [
        {
          text: 'Goodbye',
          start: 0.0,
          end: 0.8,
          words: [{ text: 'Goodbye', start: 0.0, end: 0.8 }],
        },
      ];

      const promise1 = service.transcribe('track-1', buffer1);
      simulateWorkerResult('en', sampleSegments, 0);
      await promise1;

      const promise2 = service.transcribe('track-2', buffer2);
      simulateWorkerResult('fr', otherSegments, 1);
      await promise2;

      expect(service.getTranscription('track-1')?.language).toBe('en');
      expect(service.getTranscription('track-2')?.language).toBe('fr');
      expect(service.transcriptions.size).toBe(2);
    });

    it('assigns sequential message IDs', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.transcribe('track-1', buffer);
      simulateWorkerResult('en', sampleSegments, 0);
      await promise1;

      const promise2 = service.transcribe('track-2', buffer);
      simulateWorkerResult('en', sampleSegments, 1);
      await promise2;

      expect(mockWorker.postMessage.mock.calls[0][0].id).toBe(0);
      expect(mockWorker.postMessage.mock.calls[1][0].id).toBe(1);
    });

    it('sets state to transcribing while worker processes', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      expect(service.getTranscriptionState('track-1')).toBe('transcribing');

      simulateWorkerResult('en', sampleSegments);
      await promise;
    });
  });

  describe('download progress', () => {
    it('updates download progress when the worker reports it', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateDownloadProgress(45);

      expect(service.downloadProgress).toBe(45);

      simulateWorkerResult('en', sampleSegments);
      await promise;
    });

    it('clears download progress when transcription result arrives', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateDownloadProgress(75);
      expect(service.downloadProgress).toBe(75);

      simulateWorkerResult('en', sampleSegments);
      await promise;

      expect(service.downloadProgress).toBeNull();
    });

    it('clears download progress on worker error', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateDownloadProgress(50);

      // Trigger onerror (catastrophic worker failure) — rejects all pending
      // requests and falls back to main-thread inference.
      mockWorker.onerror!({} as ErrorEvent);
      await promise;

      expect(service.downloadProgress).toBeNull();
    });
  });

  describe('worker error handling with main-thread fallback', () => {
    it('falls back to main thread when the worker responds with an error', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateWorkerError('Whisper pipeline failed');
      await promise;

      // Should have fallen back to main-thread pipeline
      expect(mockTranscriberFn).toHaveBeenCalled();
      expect(service.getTranscriptionState('track-1')).toBe('done');
      expect(service.getTranscription('track-1')?.segments).toHaveLength(1);
    });

    it('falls back to main thread when the worker crashes (onerror)', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      mockWorker.onerror!({} as ErrorEvent);
      await promise;

      expect(mockTranscriberFn).toHaveBeenCalled();
      expect(service.getTranscriptionState('track-1')).toBe('done');
    });

    it('sets state to error when both worker and main thread fail', async () => {
      mockTranscriberFn.mockRejectedValue(new Error('model load error'));

      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);

      simulateWorkerError('Worker failed');

      await expect(promise).rejects.toThrow(
        'Transcription failed for track track-1',
      );
      expect(service.getTranscriptionState('track-1')).toBe('error');
    });

    it('uses main thread directly after worker has failed once', async () => {
      const buffer = createAudioBuffer();

      // First call — worker error triggers fallback
      const promise1 = service.transcribe('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise1;

      // Second call — should go directly to main thread (no worker message)
      const postMessageCallCount = mockWorker.postMessage.mock.calls.length;

      mockTranscriberFn.mockResolvedValueOnce({
        language: 'en',
        chunks: [{ text: ' test', timestamp: [0.0, 0.5] }],
      });
      await service.transcribe('track-2', buffer);

      expect(mockWorker.postMessage.mock.calls.length).toBe(
        postMessageCallCount,
      );
    });

    it('reuses the pipeline across multiple fallback calls', async () => {
      const { pipeline: createPipeline } =
        await import('@huggingface/transformers');

      const buffer = createAudioBuffer();

      // First call — trigger fallback
      const promise1 = service.transcribe('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise1;

      // Second call — reuses pipeline
      mockTranscriberFn.mockResolvedValueOnce({
        language: 'en',
        chunks: [{ text: ' test', timestamp: [0.0, 0.5] }],
      });
      await service.transcribe('track-2', buffer);

      // Pipeline created only once
      expect(createPipeline).toHaveBeenCalledTimes(1);
    });
  });

  describe('main-thread fallback audio preprocessing', () => {
    it('downmixes stereo to mono for main-thread fallback', async () => {
      const buffer = createAudioBuffer(2, 48000, 16000);

      const promise = service.transcribe('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      // The main-thread transcriber should receive a Float32Array (mono)
      const audioArg = mockTranscriberFn.mock.calls[0][0] as Float32Array;
      expect(audioArg).toBeInstanceOf(Float32Array);
      expect(audioArg.length).toBe(48000);
    });

    it('resamples from 44100 to 16000 for main-thread fallback', async () => {
      // 3 seconds at 44100 Hz = 132300 samples
      const buffer = createAudioBuffer(1, 132300, 44100);

      const promise = service.transcribe('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      // After resampling: 3s * 16000 = 48000 samples
      const audioArg = mockTranscriberFn.mock.calls[0][0] as Float32Array;
      expect(audioArg.length).toBe(48000);
    });

    it('does not resample when already at 16 kHz', async () => {
      const buffer = createAudioBuffer(1, 48000, 16000);

      const promise = service.transcribe('track-1', buffer);
      simulateWorkerError('Worker failed');
      await promise;

      const audioArg = mockTranscriberFn.mock.calls[0][0] as Float32Array;
      expect(audioArg.length).toBe(48000);
    });
  });

  describe('removeTranscription', () => {
    it('removes a transcription entry', async () => {
      const buffer = createAudioBuffer();
      const promise = service.transcribe('track-1', buffer);
      simulateWorkerResult('en', sampleSegments);
      await promise;

      service.removeTranscription('track-1');

      expect(service.getTranscription('track-1')).toBeUndefined();
      expect(service.getTranscriptionState('track-1')).toBe('idle');
      expect(service.transcriptions.size).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all transcriptions', async () => {
      const buffer = createAudioBuffer();

      const promise1 = service.transcribe('track-1', buffer);
      simulateWorkerResult('en', sampleSegments, 0);
      await promise1;

      const promise2 = service.transcribe('track-2', buffer);
      simulateWorkerResult('en', sampleSegments, 1);
      await promise2;

      service.reset();

      expect(service.transcriptions.size).toBe(0);
    });
  });
});
