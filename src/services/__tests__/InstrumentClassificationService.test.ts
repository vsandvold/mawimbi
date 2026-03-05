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

  describe('classify', () => {
    it('returns the top-scoring label', async () => {
      const buffer = createAudioBuffer();

      const label = await service.classify('track-1', buffer);

      expect(label).toBe('guitar');
    });

    it('stores the result in the classifications signal', async () => {
      const buffer = createAudioBuffer();

      await service.classify('track-1', buffer);

      const result = service.getClassification('track-1');
      expect(result).toEqual({ label: 'guitar', score: 0.85 });
    });

    it('sets state to done after classification', async () => {
      const buffer = createAudioBuffer();

      await service.classify('track-1', buffer);

      expect(service.getClassificationState('track-1')).toBe('done');
    });

    it('returns cached result without re-running inference', async () => {
      const buffer = createAudioBuffer();

      await service.classify('track-1', buffer);
      const label = await service.classify('track-1', buffer);

      expect(label).toBe('guitar');
      expect(mockClassifier).toHaveBeenCalledTimes(1);
    });

    it('classifies multiple tracks independently', async () => {
      const buffer1 = createAudioBuffer();
      const buffer2 = createAudioBuffer();

      mockClassifier
        .mockResolvedValueOnce([
          { label: 'guitar', score: 0.9 },
          { label: 'bass', score: 0.1 },
        ])
        .mockResolvedValueOnce([
          { label: 'drums', score: 0.8 },
          { label: 'percussion', score: 0.2 },
        ]);

      await service.classify('track-1', buffer1);
      await service.classify('track-2', buffer2);

      expect(service.getClassification('track-1')?.label).toBe('guitar');
      expect(service.getClassification('track-2')?.label).toBe('drums');
      expect(service.classifications.size).toBe(2);
    });

    it('sets state to error when classification fails', async () => {
      mockClassifier.mockRejectedValue(new Error('model error'));
      const buffer = createAudioBuffer();

      await expect(service.classify('track-1', buffer)).rejects.toThrow(
        'Classification failed for track track-1',
      );

      expect(service.getClassificationState('track-1')).toBe('error');
    });

    it('passes candidate labels to the pipeline', async () => {
      const buffer = createAudioBuffer();

      await service.classify('track-1', buffer);

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
  });

  describe('audio preprocessing', () => {
    it('downmixes stereo to mono', async () => {
      const buffer = createAudioBuffer(2, 48000, 48000);

      await service.classify('track-1', buffer);

      const passedAudio = mockClassifier.mock.calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });

    it('resamples from 44100 to 48000', async () => {
      const buffer = createAudioBuffer(1, 44100, 44100);

      await service.classify('track-1', buffer);

      const passedAudio = mockClassifier.mock.calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });

    it('does not resample when already at target rate', async () => {
      const buffer = createAudioBuffer(1, 48000, 48000);

      await service.classify('track-1', buffer);

      const passedAudio = mockClassifier.mock.calls[0][0] as Float32Array;
      expect(passedAudio.length).toBe(48000);
    });
  });

  describe('pipeline loading', () => {
    it('loads the pipeline lazily on first classify call', async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const buffer = createAudioBuffer();

      await service.classify('track-1', buffer);

      expect(pipeline).toHaveBeenCalledWith(
        'zero-shot-audio-classification',
        'Xenova/clap-large',
        { device: 'wasm' },
      );
    });

    it('reuses the pipeline across multiple calls', async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const buffer = createAudioBuffer();

      await service.classify('track-1', buffer);
      mockClassifier.mockResolvedValueOnce([{ label: 'bass', score: 0.9 }]);
      await service.classify('track-2', buffer);

      expect(pipeline).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeClassification', () => {
    it('removes a classification entry', async () => {
      const buffer = createAudioBuffer();
      await service.classify('track-1', buffer);

      service.removeClassification('track-1');

      expect(service.getClassification('track-1')).toBeUndefined();
      expect(service.getClassificationState('track-1')).toBe('idle');
      expect(service.classifications.size).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all classifications', async () => {
      const buffer = createAudioBuffer();
      await service.classify('track-1', buffer);
      await service.classify('track-2', buffer);

      service.reset();

      expect(service.classifications.size).toBe(0);
    });
  });
});
