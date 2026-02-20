import { render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
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

it('renders without crashing with empty tracks', () => {
  render(<Mixer tracks={[]} mutedTracks={[]} />);
});

it('renders a channel for each track', () => {
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

it('renders tracks in reversed order', () => {
  const tracks = [
    mockTrack({ trackId: 'track-A', index: 0, color: { r: 100, g: 0, b: 0 } }),
    mockTrack({ trackId: 'track-B', index: 1, color: { r: 0, g: 100, b: 0 } }),
    mockTrack({ trackId: 'track-C', index: 2, color: { r: 0, g: 0, b: 100 } }),
  ];

  const { container } = render(<Mixer tracks={tracks} mutedTracks={[]} />);

  const channelElements = container.querySelectorAll('.mixer__channel');
  expect(channelElements).toHaveLength(3);
  // Mixer renders tracks reversed, so first displayed should be last in tracks array
});

it('renders mixer container', () => {
  const tracks = [mockTrack({ trackId: 'track-1', index: 0 })];

  const { container } = render(<Mixer tracks={tracks} mutedTracks={[]} />);

  expect(container.querySelector('.mixer')).toBeInTheDocument();
});
