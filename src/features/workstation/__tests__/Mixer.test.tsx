import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Mixer from '../Mixer';

const trackService = AudioService.getInstance().trackService;

const mockProjectDispatch = vi.fn();

vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

vi.mock('../../classification/useClassificationService', () => ({
  useClassificationService: () => ({
    classifications: new Map(),
    downloadProgress: null,
    getClassification: () => undefined,
    getClassificationState: () => 'idle',
    removeClassification: vi.fn(),
    reset: vi.fn(),
  }),
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

it('closes other instrument dropdowns when one opens', async () => {
  const user = userEvent.setup();
  trackService.createSignals('track-1');
  trackService.createSignals('track-2');
  const tracks = [
    mockTrack({ trackId: 'track-1', index: 0, instrument: 'guitar' }),
    mockTrack({ trackId: 'track-2', index: 1, instrument: 'drums' }),
  ];

  render(<Mixer tracks={tracks} />);

  const triggers = screen.getAllByRole('button', { name: /Guitar|Drums/ });
  const guitarTrigger = triggers.find((t) => t.title === 'Guitar')!;
  const drumsTrigger = triggers.find((t) => t.title === 'Drums')!;

  // Open guitar channel's dropdown
  await user.click(guitarTrigger);
  const menus = screen.getAllByRole('menu');
  expect(menus).toHaveLength(1);

  // Open drums channel's dropdown — guitar's should close
  await user.click(drumsTrigger);
  const menusAfter = screen.getAllByRole('menu');
  expect(menusAfter).toHaveLength(1);
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
