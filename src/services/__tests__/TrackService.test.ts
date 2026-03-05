import { vi } from 'vitest';
import * as Tone from 'tone';
import TrackService from '../TrackService';

// jsdom doesn't implement URL.createObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
}

function mockAudioBuffer(overrides: Partial<AudioBuffer> = {}): AudioBuffer {
  const channelData = new Float32Array(100).fill(0.2);
  return {
    numberOfChannels: 1,
    length: 100,
    sampleRate: 44100,
    duration: 100 / 44100,
    getChannelData: vi.fn().mockReturnValue(channelData),
    ...overrides,
  } as unknown as AudioBuffer;
}

let service: TrackService;

beforeEach(() => {
  vi.mocked(Tone.context.decodeAudioData).mockResolvedValue(mockAudioBuffer());
  service = new TrackService(Tone.context);
});

describe('TrackService', () => {
  describe('createSignals', () => {
    it('creates signals with default values', () => {
      const signals = service.createSignals('track-1');

      expect(signals.volume.value).toBe(100);
      expect(signals.mute.value).toBe(false);
      expect(signals.solo.value).toBe(false);
    });

    it('creates signals with a custom initial volume', () => {
      const signals = service.createSignals('track-1', 75);

      expect(signals.volume.value).toBe(75);
      expect(signals.mute.value).toBe(false);
      expect(signals.solo.value).toBe(false);
    });

    it('stores the signals so they can be retrieved', () => {
      service.createSignals('track-1');

      const retrieved = service.getSignals('track-1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.volume.value).toBe(100);
    });
  });

  describe('getSignals', () => {
    it('returns undefined for unknown track', () => {
      expect(service.getSignals('nonexistent')).toBeUndefined();
    });
  });

  describe('disposeSignals', () => {
    it('removes the signals for a track', () => {
      service.createSignals('track-1');

      service.disposeSignals('track-1');

      expect(service.getSignals('track-1')).toBeUndefined();
    });

    it('does not affect other tracks', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');

      service.disposeSignals('track-1');

      expect(service.getSignals('track-2')).toBeDefined();
    });
  });

  describe('reset', () => {
    it('clears all track signals', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');

      service.reset();

      expect(service.getSignals('track-1')).toBeUndefined();
      expect(service.getSignals('track-2')).toBeUndefined();
    });
  });

  describe('signalKeys', () => {
    it('returns all track ids', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');

      const ids = Array.from(service.signalKeys());

      expect(ids).toEqual(['track-1', 'track-2']);
    });
  });

  describe('signal reactivity', () => {
    it('allows updating volume', () => {
      const signals = service.createSignals('track-1');

      signals.volume.value = 75;

      expect(signals.volume.value).toBe(75);
      expect(service.getSignals('track-1')!.volume.value).toBe(75);
    });

    it('allows toggling mute', () => {
      const signals = service.createSignals('track-1');

      signals.mute.value = true;

      expect(signals.mute.value).toBe(true);
    });

    it('allows toggling solo', () => {
      const signals = service.createSignals('track-1');

      signals.solo.value = true;

      expect(signals.solo.value).toBe(true);
    });
  });

  describe('mutedTracks computed signal', () => {
    it('returns empty array when no tracks exist', () => {
      expect(service.mutedTracks).toEqual([]);
    });

    it('returns empty array when no tracks are muted or soloed', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');

      expect(service.mutedTracks).toEqual([]);
    });

    it('includes muted tracks', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');
      service.getSignals('track-1')!.mute.value = true;

      expect(service.mutedTracks).toEqual(['track-1']);
    });

    it('mutes non-solo tracks when any track is soloed', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');
      service.createSignals('track-3');
      service.getSignals('track-1')!.solo.value = true;

      expect(service.mutedTracks).toEqual(['track-2', 'track-3']);
    });

    it('mutes a track that is both muted and soloed', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');
      service.getSignals('track-1')!.mute.value = true;
      service.getSignals('track-1')!.solo.value = true;

      // track-1 is muted (mute overrides solo), track-2 is muted (no solo)
      expect(service.mutedTracks).toEqual(['track-1', 'track-2']);
    });

    it('handles multiple soloed tracks', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');
      service.createSignals('track-3');
      service.getSignals('track-1')!.solo.value = true;
      service.getSignals('track-2')!.solo.value = true;

      // Only track-3 is muted (not soloed while others are)
      expect(service.mutedTracks).toEqual(['track-3']);
    });

    it('updates when track signals change', () => {
      service.createSignals('track-1');
      service.createSignals('track-2');

      expect(service.mutedTracks).toEqual([]);

      service.getSignals('track-1')!.mute.value = true;

      expect(service.mutedTracks).toEqual(['track-1']);

      service.getSignals('track-1')!.mute.value = false;

      expect(service.mutedTracks).toEqual([]);
    });

    it('updates when tracks are added or removed', () => {
      service.createSignals('track-1');
      service.getSignals('track-1')!.solo.value = true;

      // Only track-1 is soloed, no other tracks to mute
      expect(service.mutedTracks).toEqual([]);

      service.createSignals('track-2');

      // Now track-2 should be muted (not soloed while track-1 is)
      expect(service.mutedTracks).toEqual(['track-2']);

      service.disposeSignals('track-2');

      expect(service.mutedTracks).toEqual([]);
    });
  });

  describe('createTrack', () => {
    it('decodes audio data and returns a track ID and initial volume', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      const { trackId, initialVolume } = await service.createTrack(arrayBuffer);

      expect(Tone.context.decodeAudioData).toHaveBeenCalledWith(arrayBuffer);
      expect(trackId).toBeDefined();
      expect(typeof trackId).toBe('string');
      expect(typeof initialVolume).toBe('number');
    });

    it('creates signals for the new track', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(16));

      expect(service.getSignals(trackId)).toBeDefined();
    });

    it('creates a mixer channel for the new track', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      const { trackId } = await service.createTrack(arrayBuffer);

      expect(service.retrieveChannel(trackId)).toBeDefined();
    });

    it('stores the blob URL for the track', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      const { trackId } = await service.createTrack(arrayBuffer);
      const blobUrl = service.retrieveBlobUrl(trackId);

      expect(blobUrl).toBeDefined();
      expect(blobUrl).toContain('blob:');
    });

    it('stores the audio buffer for the track', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      const { trackId } = await service.createTrack(arrayBuffer);
      const audioBuffer = service.retrieveAudioBuffer(trackId);

      expect(audioBuffer).toBeDefined();
    });

    it('stores normalization data for undo/redo retrieval', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      const { trackId, initialVolume } = await service.createTrack(arrayBuffer);

      expect(service.retrieveInitialVolume(trackId)).toBe(initialVolume);
      expect(typeof service.retrieveNormalizationGainDb(trackId)).toBe(
        'number',
      );
    });

    it('stores start time of zero for uploaded tracks', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      const { trackId } = await service.createTrack(arrayBuffer);

      expect(service.retrieveStartTime(trackId)).toBe(0);
    });

    it('returns undefined for unknown track IDs', () => {
      expect(service.retrieveBlobUrl('nonexistent')).toBeUndefined();
      expect(service.retrieveAudioBuffer('nonexistent')).toBeUndefined();
      expect(service.retrieveInitialVolume('nonexistent')).toBeUndefined();
      expect(service.retrieveStartTime('nonexistent')).toBeUndefined();
    });

    it('returns initial volume of 100 for a buffer at target RMS', async () => {
      const channelData = new Float32Array(100).fill(0.2);
      vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(
        mockAudioBuffer({
          getChannelData: vi.fn().mockReturnValue(channelData),
        }),
      );

      const { initialVolume } = await service.createTrack(new ArrayBuffer(16));

      expect(initialVolume).toBe(100);
    });

    it('returns initial volume below 100 for a quiet buffer', async () => {
      const channelData = new Float32Array(100).fill(0.05);
      vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(
        mockAudioBuffer({
          getChannelData: vi.fn().mockReturnValue(channelData),
        }),
      );

      const { initialVolume } = await service.createTrack(new ArrayBuffer(16));

      expect(initialVolume).toBeLessThan(100);
      expect(initialVolume).toBeGreaterThan(0);
    });
  });

  describe('getTotalTime', () => {
    it('returns 0 when no tracks exist', () => {
      expect(service.getTotalTime()).toBe(0);
    });

    it('returns the duration of the longest track', async () => {
      vi.mocked(Tone.context.decodeAudioData)
        .mockResolvedValueOnce(mockAudioBuffer({ duration: 5.0 }))
        .mockResolvedValueOnce(mockAudioBuffer({ duration: 10.0 }))
        .mockResolvedValueOnce(mockAudioBuffer({ duration: 3.0 }));

      await service.createTrack(new ArrayBuffer(16));
      await service.createTrack(new ArrayBuffer(16));
      await service.createTrack(new ArrayBuffer(16));

      expect(service.getTotalTime()).toBe(10.0);
    });
  });

  describe('createRecordedTrack', () => {
    it('creates a track with the given start time', () => {
      const audioBuffer = mockAudioBuffer({ duration: 5.0 });

      const { trackId, initialVolume } = service.createRecordedTrack(
        audioBuffer,
        new ArrayBuffer(16),
        3.0,
      );

      expect(trackId).toBeDefined();
      expect(typeof initialVolume).toBe('number');
      expect(service.retrieveStartTime(trackId)).toBe(3.0);
    });

    it('creates signals for the recorded track', () => {
      const audioBuffer = mockAudioBuffer({ duration: 5.0 });

      const { trackId } = service.createRecordedTrack(
        audioBuffer,
        new ArrayBuffer(16),
        0,
      );

      expect(service.getSignals(trackId)).toBeDefined();
    });

    it('includes recorded track in total time calculation', () => {
      const audioBuffer = mockAudioBuffer({ duration: 5.0 });

      service.createRecordedTrack(audioBuffer, new ArrayBuffer(16), 8.0);

      // Total = startTime (8) + duration (5) = 13
      expect(service.getTotalTime()).toBe(13.0);
    });
  });

  describe('restoreTrack', () => {
    it('uses the provided track ID instead of generating a new one', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      const { trackId } = await service.restoreTrack(
        'restored-id',
        arrayBuffer,
        0,
      );

      expect(trackId).toBe('restored-id');
    });

    it('decodes audio data and creates signals', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      await service.restoreTrack('restored-id', arrayBuffer, 0);

      expect(Tone.context.decodeAudioData).toHaveBeenCalledWith(arrayBuffer);
      expect(service.getSignals('restored-id')).toBeDefined();
    });

    it('creates a mixer channel for the restored track', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      await service.restoreTrack('restored-id', arrayBuffer, 0);

      expect(service.retrieveChannel('restored-id')).toBeDefined();
    });

    it('stores the blob URL for the restored track', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      await service.restoreTrack('restored-id', arrayBuffer, 0);

      const blobUrl = service.retrieveBlobUrl('restored-id');
      expect(blobUrl).toBeDefined();
      expect(blobUrl).toContain('blob:');
    });

    it('preserves the start time for restored tracks', async () => {
      const arrayBuffer = new ArrayBuffer(16);

      await service.restoreTrack('restored-id', arrayBuffer, 3.5);

      expect(service.retrieveStartTime('restored-id')).toBe(3.5);
    });

    it('includes restored track in total time calculation', async () => {
      vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(
        mockAudioBuffer({ duration: 5.0 }),
      );

      await service.restoreTrack('restored-id', new ArrayBuffer(16), 2.0);

      // Total = startTime (2) + duration (5) = 7
      expect(service.getTotalTime()).toBe(7.0);
    });

    it('fires the onTrackCreated callback', async () => {
      const callback = vi.fn();
      service.setOnTrackCreated(callback);

      await service.restoreTrack('restored-id', new ArrayBuffer(16), 0);

      expect(callback).toHaveBeenCalledWith('restored-id', expect.any(Object));
    });
  });
});
