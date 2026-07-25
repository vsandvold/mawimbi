import { renderHook } from '@testing-library/react';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { MIN_TEMPO_CONFIDENCE } from '../../rhythm/tempo';
import { type Track } from '../../tracks/types';
import { useTrackControlsSync } from '../projectPageEffects';

const trackService = AudioService.getInstance().trackService;

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    trackId: 'track-1',
    color: { r: 77, g: 238, b: 234 },
    fileName: 'drums.wav',
    index: 0,
    ...overrides,
  };
}

afterEach(() => {
  resetAllSignals();
});

describe('useTrackControlsSync', () => {
  describe('effects', () => {
    it('pushes a persisted effect amount into the live signal when it changes (undo/redo)', () => {
      trackService.createSignals('track-1', 100, {
        crush: 0,
        space: 40,
        echo: 0,
        tone: 0,
      });
      const initialTracks = [
        createTrack({ effects: { crush: 0, space: 40, echo: 0, tone: 0 } }),
      ];

      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        { initialProps: { tracks: initialTracks } },
      );

      expect(trackService.getSignals('track-1')!.effects.space.value).toBe(40);

      // Simulate an undo reverting the committed amount back to 10
      const undoneTracks = [
        createTrack({ effects: { crush: 0, space: 10, echo: 0, tone: 0 } }),
      ];
      rerender({ tracks: undoneTracks });

      expect(trackService.getSignals('track-1')!.effects.space.value).toBe(10);
    });

    it('does nothing for a track with no persisted effects', () => {
      trackService.createSignals('track-1', 100, {
        crush: 0,
        space: 40,
        echo: 0,
        tone: 0,
      });
      const tracks = [createTrack()];

      renderHook(() => useTrackControlsSync(tracks));

      expect(trackService.getSignals('track-1')!.effects.space.value).toBe(40);
    });

    it('does not clobber a live uncommitted drag when an unrelated tracks-array change occurs', () => {
      // Reproduces the race the ref-identity diff guards against: a reducer
      // action unrelated to this track (e.g. DELETE_TRACK reindexing, or
      // SET_INSTRUMENT from background classification) rebuilds every track
      // object but passes the same `effects` object through unchanged.
      const effects = { crush: 0, space: 40, echo: 0, tone: 0 };
      trackService.createSignals('track-1', 100, effects);
      const initialTracks = [createTrack({ effects })];

      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        { initialProps: { tracks: initialTracks } },
      );

      // A live slider drag writes the signal directly, ahead of any commit.
      trackService.getSignals('track-1')!.effects.space.value = 77;

      // New outer Track object (as reindexing/other-field updates produce),
      // but the same `effects` reference — no genuine effect change.
      const unrelatedChangeTracks = [{ ...initialTracks[0], index: 5 }];
      rerender({ tracks: unrelatedChangeTracks });

      expect(trackService.getSignals('track-1')!.effects.space.value).toBe(77);
    });
  });

  describe('volume', () => {
    it('pushes a persisted volume into the live signal when it changes (undo/redo)', () => {
      trackService.createSignals('track-1', 80);
      const initialTracks = [createTrack({ volume: 80 })];

      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        { initialProps: { tracks: initialTracks } },
      );

      const undoneTracks = [createTrack({ volume: 20 })];
      rerender({ tracks: undoneTracks });

      expect(trackService.getSignals('track-1')!.volume.value).toBe(20);
    });

    it('does not clobber a live uncommitted fader drag when an unrelated tracks-array change occurs', () => {
      trackService.createSignals('track-1', 80);
      const initialTracks = [createTrack({ volume: 80 })];

      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        { initialProps: { tracks: initialTracks } },
      );

      // A live fader drag writes the signal directly, ahead of any commit.
      trackService.getSignals('track-1')!.volume.value = 55;

      // Unrelated tracks-array churn — same persisted volume value.
      const unrelatedChangeTracks = [{ ...initialTracks[0], index: 5 }];
      rerender({ tracks: unrelatedChangeTracks });

      expect(trackService.getSignals('track-1')!.volume.value).toBe(55);
    });

    it('does nothing for a track with no persisted volume', () => {
      trackService.createSignals('track-1', 80);
      const tracks = [createTrack()];

      renderHook(() => useTrackControlsSync(tracks));

      expect(trackService.getSignals('track-1')!.volume.value).toBe(80);
    });
  });

  describe('mute/solo', () => {
    it('pushes a persisted mute/solo change into the live signal (undo/redo)', () => {
      trackService.createSignals('track-1');
      const initialTracks = [createTrack({ mute: true, solo: false })];

      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        { initialProps: { tracks: initialTracks } },
      );

      expect(trackService.getSignals('track-1')!.mute.value).toBe(true);

      const undoneTracks = [createTrack({ mute: false, solo: false })];
      rerender({ tracks: undoneTracks });

      expect(trackService.getSignals('track-1')!.mute.value).toBe(false);
    });

    it('does nothing for a track with no persisted mute/solo', () => {
      trackService.createSignals('track-1');
      trackService.getSignals('track-1')!.solo.value = true;
      const tracks = [createTrack()];

      renderHook(() => useTrackControlsSync(tracks));

      expect(trackService.getSignals('track-1')!.solo.value).toBe(true);
    });
  });

  // Tempo-synced Echo (spec 007 M4, #560). The subdivision is what the user
  // committed; the delay time is derived from the track's *current* tempo,
  // so both fields have to reach the live signal.
  describe('echo sync', () => {
    const tempo = { bpm: 120, confidence: 3.77 };

    it('pushes a committed subdivision into the live signal', () => {
      trackService.createSignals('track-1');
      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        { initialProps: { tracks: [createTrack({ tempo })] } },
      );

      rerender({ tracks: [createTrack({ echoSync: 'eighth', tempo })] });

      expect(trackService.getSignals('track-1')!.echoSync.value).toEqual({
        subdivision: 'eighth',
        bpm: 120,
      });
    });

    it('reverts to no sync when an undo clears the subdivision', () => {
      trackService.createSignals('track-1');
      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        {
          initialProps: {
            tracks: [createTrack({ echoSync: 'eighth', tempo })],
          },
        },
      );

      rerender({ tracks: [createTrack({ tempo })] });

      expect(trackService.getSignals('track-1')!.echoSync.value).toBeNull();
    });

    // The decision behind this test (spec 007 open question 3): a committed
    // sync follows the current estimate rather than freezing the delay it
    // was committed with, so the echo can never disagree with the BPM the
    // drawer displays after a re-analysis.
    it('re-resolves the delay against a re-estimated tempo', () => {
      trackService.createSignals('track-1');
      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        {
          initialProps: {
            tracks: [createTrack({ echoSync: 'quarter', tempo })],
          },
        },
      );

      rerender({
        tracks: [
          createTrack({
            echoSync: 'quarter',
            tempo: { bpm: 90, confidence: 3.4 },
          }),
        ],
      });

      expect(trackService.getSignals('track-1')!.echoSync.value).toEqual({
        subdivision: 'quarter',
        bpm: 90,
      });
    });

    // A re-estimate that drops below the confidence threshold takes the sync
    // with it — the badge disappears, and the echo returns to the fixed
    // delay rather than staying synced to a number nothing displays.
    it('drops the sync when a re-estimate is no longer confident', () => {
      trackService.createSignals('track-1');
      const { rerender } = renderHook(
        ({ tracks }) => useTrackControlsSync(tracks),
        {
          initialProps: {
            tracks: [createTrack({ echoSync: 'quarter', tempo })],
          },
        },
      );

      rerender({
        tracks: [
          createTrack({
            echoSync: 'quarter',
            tempo: { bpm: 90, confidence: MIN_TEMPO_CONFIDENCE - 0.01 },
          }),
        ],
      });

      expect(trackService.getSignals('track-1')!.echoSync.value).toBeNull();
    });
  });

  it('does nothing for a track with no live signals yet', () => {
    const tracks = [
      createTrack({
        trackId: 'not-created-yet',
        effects: { crush: 0, space: 40, echo: 0, tone: 0 },
        volume: 40,
        mute: true,
      }),
    ];

    expect(() => renderHook(() => useTrackControlsSync(tracks))).not.toThrow();
  });
});
