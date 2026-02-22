import { render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { TrackSignalStore } from '../../../signals/trackSignals';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Mixer from '../Mixer';

vi.mock('../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    mixer: {
      retrieveChannel: vi.fn().mockReturnValue({
        mute: false,
        solo: false,
        volume: 100,
        dispose: vi.fn(),
      }),
    },
  }),
}));

const mockProjectDispatch = vi.fn();

vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

vi.mock('../useWorkstationDispatch', () => ({
  default: () => vi.fn(),
}));

afterEach(() => {
  resetAllSignals();
});

it('renders without crashing with empty tracks', () => {
  render(<Mixer tracks={[]} mutedTracks={[]} />);
});

it('renders a channel for each track', () => {
  TrackSignalStore.create('track-1');
  TrackSignalStore.create('track-2');
  TrackSignalStore.create('track-3');
  const tracks = [
    mockTrack({ trackId: 'track-1', index: 0 }),
    mockTrack({ trackId: 'track-2', index: 1 }),
    mockTrack({ trackId: 'track-3', index: 2 }),
  ];

  const { getAllByTitle } = render(<Mixer tracks={tracks} mutedTracks={[]} />);

  // Each channel renders a Mute button
  const muteButtons = getAllByTitle('Mute');
  expect(muteButtons).toHaveLength(3);
});

it('passes correct isMuted prop based on mutedTracks', () => {
  TrackSignalStore.create('track-1');
  TrackSignalStore.create('track-2');
  const tracks = [
    mockTrack({ trackId: 'track-1', index: 0 }),
    mockTrack({ trackId: 'track-2', index: 1 }),
  ];

  const { container } = render(
    <Mixer tracks={tracks} mutedTracks={['track-1']} />,
  );

  // The muted channel should have the inverted class
  const channels = container.querySelectorAll('.channel');
  const invertedChannels = container.querySelectorAll('.channel--inverted');
  expect(channels.length).toBe(2);
  expect(invertedChannels.length).toBeGreaterThanOrEqual(1);
});
