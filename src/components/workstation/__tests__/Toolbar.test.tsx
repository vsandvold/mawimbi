import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import { play, resetPlaybackMachine } from '../../../services/PlaybackMachine';
import {
  arm,
  resetRecordingMachine,
  startCountIn,
  startRecording,
} from '../../../services/RecordingMachine';
import { isPlaying } from '../../../signals/transportSignals';
import Toolbar from '../Toolbar';

const mockToggleMixer = vi.fn();
const mockToggleRecording = vi.fn();

const defaultProps = {
  isMixerOpen: false,
  isEmpty: false,
  onToggleMixer: mockToggleMixer,
  onToggleRecording: mockToggleRecording,
};

afterEach(() => {
  resetPlaybackMachine();
  resetRecordingMachine();
});

it('renders all buttons', () => {
  const { getAllByRole } = render(<Toolbar {...defaultProps} />);

  expect(getAllByRole('button')).toHaveLength(4);
});

it('disables buttons when tracks are empty', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: true }} />,
  );

  expect(getByTitle('Show mixer')).toBeDisabled();
  expect(getByTitle('Play')).toBeDisabled();
  expect(getByTitle('Rewind')).toBeDisabled();
  expect(getByTitle('Record')).not.toBeDisabled();
});

it('enables non-transport buttons when tracks are not empty', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: false }} />,
  );

  expect(getByTitle('Show mixer')).toBeEnabled();
  expect(getByTitle('Play')).toBeEnabled();
  expect(getByTitle('Record')).toBeEnabled();
});

it('renders play icon when stopped', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const playButton = getByTitle('Play');
  const playIcon = playButton.querySelector('[aria-label="caret-right"]');

  expect(playButton).toBeInTheDocument();
  expect(playIcon).toBeInTheDocument();
});

it('renders pause icon when playing', () => {
  play();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const pauseButton = getByTitle('Pause');
  const pauseIcon = pauseButton.querySelector('[aria-label="pause"]');

  expect(pauseButton).toBeInTheDocument();
  expect(pauseIcon).toBeInTheDocument();
});

it('renders microphone icon', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const recordButton = getByTitle('Record');
  const recordIcon = recordButton.querySelector('[aria-label="audio"]');

  expect(recordButton).toBeInTheDocument();
  expect(recordIcon).toBeInTheDocument();
});

it('applies animation class to mixer icon when mixer is open', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isMixerOpen: true }} />,
  );

  const mixerButton = getByTitle('Hide mixer');

  expect(mixerButton.querySelector('.show-mixer')).toBeInTheDocument();
});

it('toggles playback when play/pause button is clicked', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const playButton = getByTitle('Play');
  fireEvent.click(playButton);

  expect(isPlaying.value).toBe(true);
});

it('toggles mixer when mixer show/hide is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isMixerOpen: false }} />,
  );

  const mixerButton = getByTitle('Show mixer');
  fireEvent.click(mixerButton);

  expect(mockToggleMixer).toHaveBeenCalledTimes(1);
});

it('disables play/pause button while recording', () => {
  play();
  arm();
  startRecording();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Pause')).toBeDisabled();
});

it('disables play/pause button during count-in', () => {
  startCountIn();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Play')).toBeDisabled();
});

it('keeps record button enabled during count-in for cancellation', () => {
  startCountIn();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Record')).toBeEnabled();
});

it('disables rewind button when stopped', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Rewind')).toBeDisabled();
});

it('enables rewind button when playing', () => {
  play();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Rewind')).toBeEnabled();
});
