import { render } from '@testing-library/react';
import { vi } from 'vitest';
import AudioService from '../../../services/AudioService';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Mixer from '../Mixer';

const trackService = AudioService.getInstance().trackService;

const mockProjectDispatch = vi.fn();

vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

afterEach(() => {
  resetAllSignals();
});

it('renders without crashing with empty tracks', () => {
  render(<Mixer tracks={[]} />);
});

it('renders a channel for each track', () => {
  trackService.createSignals('track-1');
  trackService.createSignals('track-2');
  trackService.createSignals('track-3');
  const tracks = [
    mockTrack({ trackId: 'track-1', index: 0 }),
    mockTrack({ trackId: 'track-2', index: 1 }),
    mockTrack({ trackId: 'track-3', index: 2 }),
  ];

  const { getAllByTitle } = render(<Mixer tracks={tracks} />);

  // Each channel renders a mute/solo button
  const channelButtons = getAllByTitle('On');
  expect(channelButtons).toHaveLength(3);
});

it('marks channel as muted via mute signal', () => {
  trackService.createSignals('track-1');
  trackService.createSignals('track-2');
  trackService.getSignals('track-1')!.mute.value = true;

  const tracks = [
    mockTrack({ trackId: 'track-1', index: 0 }),
    mockTrack({ trackId: 'track-2', index: 1 }),
  ];

  const { container } = render(<Mixer tracks={tracks} />);

  // The muted channel should have the inverted class
  const channels = container.querySelectorAll('.channel');
  const invertedChannels = container.querySelectorAll('.channel--inverted');
  expect(channels.length).toBe(2);
  expect(invertedChannels.length).toBeGreaterThanOrEqual(1);
});
