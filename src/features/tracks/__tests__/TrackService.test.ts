import { vi } from 'vitest';
import * as Tone from 'tone';
import TrackService, { EDIT_FOCUS_DIM_DB } from '../TrackService';

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

    it('defaults effect amounts to bypass', () => {
      const signals = service.createSignals('track-1');

      expect(signals.effects.space.value).toBe(0);
      expect(signals.effects.echo.value).toBe(0);
      expect(signals.effects.tone.value).toBe(0);
    });

    it('seeds effect amounts from persisted params (spec 004 M5)', () => {
      const signals = service.createSignals('track-1', 80, {
        space: 25,
        echo: 50,
        tone: 75,
      });

      expect(signals.effects.space.value).toBe(25);
      expect(signals.effects.echo.value).toBe(50);
      expect(signals.effects.tone.value).toBe(75);
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

  describe('setEditFocus (edit-mode audio)', () => {
    // The mocked audio buffer sits exactly at the normalization target
    // (RMS 0.2), so initialVolume is 100 and the synced channel volume is
    // 0 dB — any dim offset shows up as the ramp target verbatim.
    const lastRampDb = (toneChannel: {
      volume: { rampTo: ReturnType<typeof vi.fn> };
    }) => toneChannel.volume.rampTo.mock.lastCall?.[0];

    it('bypasses channel mute while edit focus is active and restores it on exit', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));
      service.getSignals(trackId)!.mute.value = true;
      expect(service.retrieveChannel(trackId)!.mute).toBe(true);

      service.setEditFocus(trackId);
      expect(service.retrieveChannel(trackId)!.mute).toBe(false);

      service.setEditFocus(null);
      expect(service.retrieveChannel(trackId)!.mute).toBe(true);
    });

    it('bypasses channel solo while edit focus is active and restores it on exit', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));
      service.getSignals(trackId)!.solo.value = true;
      expect(service.retrieveChannel(trackId)!.solo).toBe(true);

      service.setEditFocus(trackId);
      expect(service.retrieveChannel(trackId)!.solo).toBe(false);

      service.setEditFocus(null);
      expect(service.retrieveChannel(trackId)!.solo).toBe(true);
    });

    it('keeps the user mute/solo signals untouched while bypassed', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));
      const signals = service.getSignals(trackId)!;
      signals.mute.value = true;
      signals.solo.value = true;

      service.setEditFocus(trackId);

      expect(signals.mute.value).toBe(true);
      expect(signals.solo.value).toBe(true);
    });

    it('keeps a mute toggled mid-edit bypassed until exit', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));
      service.setEditFocus(trackId);

      service.getSignals(trackId)!.mute.value = true;
      expect(service.retrieveChannel(trackId)!.mute).toBe(false);

      service.setEditFocus(null);
      expect(service.retrieveChannel(trackId)!.mute).toBe(true);
    });

    it('dims only background channels while edit focus is active', async () => {
      await service.createTrack(new ArrayBuffer(8));
      const second = await service.createTrack(new ArrayBuffer(8));
      const firstTone = vi.mocked(Tone.Channel).mock.results[0].value;
      const secondTone = vi.mocked(Tone.Channel).mock.results[1].value;

      service.setEditFocus(second.trackId);

      expect(lastRampDb(firstTone)).toBeCloseTo(EDIT_FOCUS_DIM_DB, 5);
      expect(lastRampDb(secondTone)).toBeCloseTo(0, 5);
    });

    it('moves the dim when the focus cycles to another track', async () => {
      const first = await service.createTrack(new ArrayBuffer(8));
      const second = await service.createTrack(new ArrayBuffer(8));
      const firstTone = vi.mocked(Tone.Channel).mock.results[0].value;
      const secondTone = vi.mocked(Tone.Channel).mock.results[1].value;

      service.setEditFocus(second.trackId);
      service.setEditFocus(first.trackId);

      expect(lastRampDb(firstTone)).toBeCloseTo(0, 5);
      expect(lastRampDb(secondTone)).toBeCloseTo(EDIT_FOCUS_DIM_DB, 5);
    });

    it('restores background volume when edit focus exits', async () => {
      await service.createTrack(new ArrayBuffer(8));
      const second = await service.createTrack(new ArrayBuffer(8));
      const firstTone = vi.mocked(Tone.Channel).mock.results[0].value;

      service.setEditFocus(second.trackId);
      service.setEditFocus(null);

      expect(lastRampDb(firstTone)).toBeCloseTo(0, 5);
    });

    it('lands the dim before the mute bypass releases a muted channel (no pop)', async () => {
      const first = await service.createTrack(new ArrayBuffer(8));
      const second = await service.createTrack(new ArrayBuffer(8));
      const firstTone = vi.mocked(Tone.Channel).mock.results[0].value;
      service.getSignals(first.trackId)!.mute.value = true;

      service.setEditFocus(second.trackId);

      // The dim must be applied as an instant snap while the channel is
      // still muted — a ramp would let the freshly un-muted channel play
      // up to 12 dB above its dimmed level for the ramp duration.
      expect(firstTone.mute).toBe(false);
      expect(firstTone.volume.value).toBeCloseTo(EDIT_FOCUS_DIM_DB, 5);
    });

    it('applies the bypass and dim to a channel recreated mid-edit', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));
      const second = await service.createTrack(new ArrayBuffer(8));
      service.getSignals(trackId)!.mute.value = true;
      service.setEditFocus(second.trackId);

      service.disposeSignals(trackId);
      service.deleteChannel(trackId);
      service.createSignals(trackId, 100);
      service.getSignals(trackId)!.mute.value = true;
      service.recreateChannel(trackId);

      const recreatedTone = vi.mocked(Tone.Channel).mock.results[2].value;
      expect(service.retrieveChannel(trackId)!.mute).toBe(false);
      expect(lastRampDb(recreatedTone)).toBeCloseTo(EDIT_FOCUS_DIM_DB, 5);
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

    it('restores persisted effect amounts into the new signals (spec 004 M5)', async () => {
      await service.restoreTrack('restored-id', new ArrayBuffer(16), 0, {
        space: 40,
        echo: 0,
        tone: 60,
      });

      const signals = service.getSignals('restored-id')!;
      expect(signals.effects.space.value).toBe(40);
      expect(signals.effects.echo.value).toBe(0);
      expect(signals.effects.tone.value).toBe(60);
      expect(
        service.retrieveChannel('restored-id')!.getEffectAmount('space'),
      ).toBe(40);
    });

    it('fires the onTrackCreated callback', async () => {
      const callback = vi.fn();
      service.setOnTrackCreated(callback);

      await service.restoreTrack('restored-id', new ArrayBuffer(16), 0);

      expect(callback).toHaveBeenCalledWith('restored-id', expect.any(Object));
    });
  });

  describe('effect signal → mixer sync', () => {
    it('creates effect signals defaulting to bypass', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));

      const signals = service.getSignals(trackId)!;
      expect(signals.effects.space.value).toBe(0);
      expect(signals.effects.echo.value).toBe(0);
      expect(signals.effects.tone.value).toBe(0);
    });

    it('syncs effect signal writes to the mixer channel', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));

      service.getSignals(trackId)!.effects.space.value = 42;

      expect(service.retrieveChannel(trackId)!.getEffectAmount('space')).toBe(
        42,
      );
    });

    it('syncs each effect independently', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));
      const channel = service.retrieveChannel(trackId)!;

      service.getSignals(trackId)!.effects.echo.value = 30;
      service.getSignals(trackId)!.effects.tone.value = 70;

      expect(channel.getEffectAmount('space')).toBe(0);
      expect(channel.getEffectAmount('echo')).toBe(30);
      expect(channel.getEffectAmount('tone')).toBe(70);
    });

    it('affects only the written track when several tracks exist', async () => {
      const first = await service.createTrack(new ArrayBuffer(8));
      const second = await service.createTrack(new ArrayBuffer(8));

      service.getSignals(first.trackId)!.effects.space.value = 55;

      expect(
        service.retrieveChannel(second.trackId)!.getEffectAmount('space'),
      ).toBe(0);
    });

    it('stops syncing after signals are disposed', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));
      const signals = service.getSignals(trackId)!;

      service.disposeSignals(trackId);
      signals.effects.space.value = 42;

      expect(service.retrieveChannel(trackId)!.getEffectAmount('space')).toBe(
        0,
      );
    });

    // Regression test for the #212 class: the undo flow (projectPageEffects'
    // useTrackSideEffects) recreates signals BEFORE the mixer channel, so
    // createSignals cannot wire the sync — recreateChannel must re-bind it,
    // or every control on an undo-restored track is silently dead.
    it('re-binds signal sync when the channel is recreated after undo', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));

      // Delete-track flow
      service.disposeSignals(trackId);
      service.deleteChannel(trackId);

      // Undo flow: signals first, then the channel
      service.createSignals(trackId, 80);
      service.recreateChannel(trackId);

      service.getSignals(trackId)!.effects.space.value = 42;

      expect(service.retrieveChannel(trackId)!.getEffectAmount('space')).toBe(
        42,
      );
    });

    it('applies current signal values to the recreated channel immediately', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));

      service.disposeSignals(trackId);
      service.deleteChannel(trackId);
      service.createSignals(trackId, 80);
      const signals = service.getSignals(trackId)!;
      signals.mute.value = true;

      service.recreateChannel(trackId);

      expect(service.retrieveChannel(trackId)!.mute).toBe(true);
    });

    // Regression test for the #212 class, extended to effect settings
    // (spec 004 M5, #493): projectPageEffects' useTrackSideEffects passes
    // the project's persisted Track.effects into createSignals on
    // undo-restore. Without that, the recreated signals silently reset to
    // dry defaults even though #492 already re-binds the signal→channel
    // sync correctly.
    it('recreated channel carries persisted effect params through undo-delete (#212 class)', async () => {
      const { trackId } = await service.createTrack(new ArrayBuffer(8));
      service.getSignals(trackId)!.effects.space.value = 55;

      // Delete-track flow
      service.disposeSignals(trackId);
      service.deleteChannel(trackId);

      // Undo flow: projectPageEffects passes the restored Track.effects
      // through to createSignals before recreating the channel.
      service.createSignals(trackId, 80, { space: 55, echo: 0, tone: 0 });
      service.recreateChannel(trackId);

      expect(service.retrieveChannel(trackId)!.getEffectAmount('space')).toBe(
        55,
      );
    });
  });
});
