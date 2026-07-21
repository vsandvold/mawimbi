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
