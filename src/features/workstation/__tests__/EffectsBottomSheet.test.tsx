import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockTrack } from '../../../testUtils';
import { MIN_TEMPO_CONFIDENCE } from '../../rhythm/tempo';
import { SET_TRACK_ECHO_SYNC } from '../../project/projectPageReducer';
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

// Tempo-synced Echo (spec 007 Goal 5, #560). Gated on the same
// `selectConfidentTempo` call as the BPM badge above, so the two can never
// disagree about whether this track has a tempo.
describe('Echo subdivision control', () => {
  function syncGroup() {
    return screen.queryByRole('group', { name: 'Echo sync' });
  }

  it('offers the four subdivisions when the track has a confident tempo', () => {
    renderDrawer([
      mockTrack({ trackId: 'track-1', tempo: { bpm: 120, confidence: 3.77 } }),
    ]);

    const group = syncGroup();
    expect(group).not.toBeNull();
    expect(within(group!).getAllByRole('button')).toHaveLength(4);
  });

  // Absent, not disabled: there is nothing to sync to, and a dead control
  // would read as something broken rather than something inapplicable.
  it('is absent when the estimate is not confident enough', () => {
    renderDrawer([
      mockTrack({
        trackId: 'track-1',
        tempo: { bpm: 120, confidence: MIN_TEMPO_CONFIDENCE - 0.01 },
      }),
    ]);

    expect(syncGroup()).toBeNull();
  });

  it('is absent while analysis has not produced an estimate yet', () => {
    renderDrawer([mockTrack({ trackId: 'track-1' })]);

    expect(syncGroup()).toBeNull();
  });

  it('marks the committed subdivision as pressed', () => {
    renderDrawer([
      mockTrack({
        trackId: 'track-1',
        tempo: { bpm: 120, confidence: 3.77 },
        echoSync: 'dottedEighth',
      }),
    ]);

    const pressed = within(syncGroup()!)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAttribute('title', 'Echo in dotted eighth notes');
  });

  it('commits the tapped subdivision', async () => {
    const user = userEvent.setup();
    renderDrawer([
      mockTrack({ trackId: 'track-1', tempo: { bpm: 120, confidence: 3.77 } }),
    ]);

    await user.click(screen.getByTitle('Echo in eighth-note triplets'));

    expect(mockDispatch).toHaveBeenCalledWith([
      SET_TRACK_ECHO_SYNC,
      { trackId: 'track-1', subdivision: 'eighthTriplet' },
    ]);
  });

  it('turns sync off when the pressed subdivision is tapped again', async () => {
    const user = userEvent.setup();
    renderDrawer([
      mockTrack({
        trackId: 'track-1',
        tempo: { bpm: 120, confidence: 3.77 },
        echoSync: 'quarter',
      }),
    ]);

    await user.click(screen.getByTitle('Echo in quarter notes'));

    expect(mockDispatch).toHaveBeenCalledWith([
      SET_TRACK_ECHO_SYNC,
      { trackId: 'track-1', subdivision: null },
    ]);
  });
});
