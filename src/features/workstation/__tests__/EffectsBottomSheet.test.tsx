import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockTrack } from '../../../testUtils';
import { MIN_TEMPO_CONFIDENCE } from '../../rhythm/tempo';
import { type Track, type TrackId } from '../../tracks/types';
import EffectsBottomSheet from '../EffectsBottomSheet';
import { enterEditMode, exitEditMode } from '../editModeSignals';

vi.mock('../BottomSheet', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bottom-sheet">{children}</div>
  ),
}));

const mockDispatch = vi.fn();
vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockDispatch,
}));

afterEach(() => exitEditMode());

function renderDrawer(tracks: Track[], activeTrackId?: TrackId) {
  enterEditMode(activeTrackId ?? tracks[0].trackId);
  return render(
    <EffectsBottomSheet
      isOpen
      onOpenChange={vi.fn()}
      onHeightChange={vi.fn()}
      tracks={tracks}
    />,
  );
}

describe('BPM badge', () => {
  it('shows the estimated tempo of the active track when it is confident', () => {
    renderDrawer([
      mockTrack({
        trackId: 'track-1',
        tempo: { bpm: 119.84, confidence: 3.77 },
      }),
    ]);

    expect(screen.getByTitle('Estimated tempo')).toHaveTextContent('120 BPM');
  });

  it('shows nothing at all when confidence is below the threshold', () => {
    // Not a disabled or placeholder badge — no confident tempo degrades to
    // the untempo'd drawer, with nothing hinting something is missing.
    renderDrawer([
      mockTrack({
        trackId: 'track-1',
        tempo: { bpm: 93, confidence: MIN_TEMPO_CONFIDENCE - 0.01 },
      }),
    ]);

    expect(screen.queryByTitle('Estimated tempo')).toBeNull();
  });

  it('shows nothing while analysis has not produced an estimate yet', () => {
    renderDrawer([mockTrack({ trackId: 'track-1' })]);

    expect(screen.queryByTitle('Estimated tempo')).toBeNull();
  });

  it('reads the active track, not the first one', () => {
    renderDrawer(
      [
        mockTrack({
          trackId: 'track-1',
          index: 0,
          tempo: { bpm: 140, confidence: 3.5 },
        }),
        mockTrack({
          trackId: 'track-2',
          index: 1,
          tempo: { bpm: 90, confidence: 3.5 },
        }),
      ],
      'track-2',
    );

    expect(screen.getByTitle('Estimated tempo')).toHaveTextContent('90 BPM');
  });
});
