import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { mockTrack } from '../../../testUtils';
import Channel from '../Channel';

const mockChannel = {
  mute: false,
  solo: false,
  volume: 100,
  dispose: vi.fn(),
};

const mockProjectDispatch = vi.fn();
const mockWorkstationDispatch = vi.fn();

vi.mock('../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    mixer: {
      retrieveChannel: vi.fn().mockReturnValue(mockChannel),
    },
  }),
}));

vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

vi.mock('../useWorkstationDispatch', () => ({
  default: () => mockWorkstationDispatch,
}));

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

it('dispatches SET_TRACK_MUTE when mute button is clicked', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Mute'));

  expect(mockProjectDispatch).toHaveBeenCalledWith([
    'SET_TRACK_MUTE',
    { id: 'track-1', mute: true },
  ]);
});

it('dispatches SET_TRACK_MUTE to unmute when already muted', () => {
  const track = mockTrack({ trackId: 'track-1', mute: true });
  const { getByTitle } = render(<Channel {...{ ...defaultProps, track }} />);

  fireEvent.click(getByTitle('Mute'));

  expect(mockProjectDispatch).toHaveBeenCalledWith([
    'SET_TRACK_MUTE',
    { id: 'track-1', mute: false },
  ]);
});

it('dispatches SET_TRACK_SOLO when solo button is clicked', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Solo'));

  expect(mockProjectDispatch).toHaveBeenCalledWith([
    'SET_TRACK_SOLO',
    { id: 'track-1', solo: true },
  ]);
});

it('dispatches SET_TRACK_SOLO to unsolo when already solo', () => {
  const track = mockTrack({ trackId: 'track-1', solo: true });
  const { getByTitle } = render(<Channel {...{ ...defaultProps, track }} />);

  fireEvent.click(getByTitle('Solo'));

  expect(mockProjectDispatch).toHaveBeenCalledWith([
    'SET_TRACK_SOLO',
    { id: 'track-1', solo: false },
  ]);
});

it('applies inverted style when channel is muted', () => {
  const track = mockTrack({ trackId: 'track-1', mute: true });
  const { container } = render(<Channel {...{ ...defaultProps, track }} />);

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
  const track = mockTrack({ trackId: 'track-1', volume: 100, mute: false });
  const { container } = render(
    <Channel {...{ ...defaultProps, isMuted: false, track }} />,
  );

  const channel = container.querySelector('.channel');
  expect(channel).not.toHaveClass('channel--inverted');
});

it('applies channel background color from track color', () => {
  const track = mockTrack({
    trackId: 'track-1',
    color: { r: 77, g: 238, b: 234 },
    volume: 100,
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
    volume: 100,
  });
  const { container } = render(
    <Channel {...{ ...defaultProps, track, isMuted: true }} />,
  );

  const channel = container.querySelector('.channel');
  expect(channel).toHaveStyle({
    backgroundColor: 'rgba(77,238,234, 0)',
  });
});
