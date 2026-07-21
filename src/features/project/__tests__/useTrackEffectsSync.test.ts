import { renderHook } from '@testing-library/react';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { type Track } from '../../tracks/types';
import { useTrackEffectsSync } from '../projectPageEffects';

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

describe('useTrackEffectsSync', () => {
  it('pushes a persisted effect amount into the live signal when it changes (undo/redo)', () => {
    trackService.createSignals('track-1', 100, { space: 40, echo: 0, tone: 0 });
    const initialTracks = [
      createTrack({ effects: { space: 40, echo: 0, tone: 0 } }),
    ];

    const { rerender } = renderHook(
      ({ tracks }) => useTrackEffectsSync(tracks),
      { initialProps: { tracks: initialTracks } },
    );

    expect(trackService.getSignals('track-1')!.effects.space.value).toBe(40);

    // Simulate an undo reverting the committed amount back to 10
    const undoneTracks = [
      createTrack({ effects: { space: 10, echo: 0, tone: 0 } }),
    ];
    rerender({ tracks: undoneTracks });

    expect(trackService.getSignals('track-1')!.effects.space.value).toBe(10);
  });

  it('does nothing for a track with no persisted effects', () => {
    trackService.createSignals('track-1', 100, { space: 40, echo: 0, tone: 0 });
    const tracks = [createTrack()];

    renderHook(() => useTrackEffectsSync(tracks));

    expect(trackService.getSignals('track-1')!.effects.space.value).toBe(40);
  });

  it('does not clobber a live uncommitted drag when an unrelated tracks-array change occurs', () => {
    // Reproduces the race the ref-identity diff guards against: a reducer
    // action unrelated to this track (e.g. DELETE_TRACK reindexing, or
    // SET_INSTRUMENT from background classification) rebuilds every track
    // object but passes the same `effects` object through unchanged.
    const effects = { space: 40, echo: 0, tone: 0 };
    trackService.createSignals('track-1', 100, effects);
    const initialTracks = [createTrack({ effects })];

    const { rerender } = renderHook(
      ({ tracks }) => useTrackEffectsSync(tracks),
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

  it('does nothing for a track with no live signals yet', () => {
    const tracks = [
      createTrack({
        trackId: 'not-created-yet',
        effects: { space: 40, echo: 0, tone: 0 },
      }),
    ];

    expect(() => renderHook(() => useTrackEffectsSync(tracks))).not.toThrow();
  });
});
