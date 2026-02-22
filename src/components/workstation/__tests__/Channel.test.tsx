import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { TrackSignalStore } from '../../../signals/trackSignals';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Channel from '../Channel';

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

beforeEach(() => {
  TrackSignalStore.create('track-1');
});

afterEach(() => {
  resetAllSignals();
});

const defaultProps = {
  isMuted: false,
  track: mockTrack({ trackId: 'track-1' }),
};

it('renders without crashing', () => {
  render(<Channel {...defaultProps} />);
});

it('renders mute button', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Mute')).toBeInTheDocument();
});

it('renders solo button', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Solo')).toBeInTheDocument();
});

it('renders move button', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Move')).toBeInTheDocument();
});

it('sets mute signal when mute button is clicked', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Mute'));

  const signals = TrackSignalStore.get('track-1')!;
  expect(signals.mute.value).toBe(true);
});

it('unsets mute signal when mute button is clicked while muted', () => {
  const signals = TrackSignalStore.get('track-1')!;
  signals.mute.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Mute'));

  expect(signals.mute.value).toBe(false);
});

it('sets solo signal when solo button is clicked', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Solo'));

  const signals = TrackSignalStore.get('track-1')!;
  expect(signals.solo.value).toBe(true);
});

it('unsets solo signal when solo button is clicked while solo', () => {
  const signals = TrackSignalStore.get('track-1')!;
  signals.solo.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Solo'));

  expect(signals.solo.value).toBe(false);
});

it('applies inverted style when channel is muted via signal', () => {
  const signals = TrackSignalStore.get('track-1')!;
  signals.mute.value = true;

  const { container } = render(<Channel {...defaultProps} />);

  const channel = container.querySelector('.channel');
  expect(channel).toHaveClass('channel--inverted');
});

it('applies inverted style when externally muted (solo on another channel)', () => {
  const { container } = render(
    <Channel {...{ ...defaultProps, isMuted: true }} />,
  );

  const channel = container.querySelector('.channel');
  expect(channel).toHaveClass('channel--inverted');
});

it('does not apply inverted style when unmuted at full volume', () => {
  const { container } = render(
    <Channel {...{ ...defaultProps, isMuted: false }} />,
  );

  const channel = container.querySelector('.channel');
  expect(channel).not.toHaveClass('channel--inverted');
});

it('applies channel background color from track color', () => {
  const track = mockTrack({
    trackId: 'track-1',
    color: { r: 77, g: 238, b: 234 },
  });
  const { container } = render(<Channel {...{ ...defaultProps, track }} />);

  const channel = container.querySelector('.channel');
  expect(channel).toHaveStyle({
    backgroundColor: 'rgba(77,238,234, 1)',
  });
});

it('sets opacity to 0 in background color when externally muted', () => {
  const track = mockTrack({
    trackId: 'track-1',
    color: { r: 77, g: 238, b: 234 },
  });
  const { container } = render(
    <Channel {...{ ...defaultProps, track, isMuted: true }} />,
  );

  const channel = container.querySelector('.channel');
  expect(channel).toHaveStyle({
    backgroundColor: 'rgba(77,238,234, 0)',
  });
});

it('reads volume from signal store', () => {
  const signals = TrackSignalStore.get('track-1')!;
  expect(signals.volume.value).toBe(100);

  render(<Channel {...defaultProps} />);

  // Volume is read from signal, not from track props
  expect(signals.volume.value).toBe(100);
});
