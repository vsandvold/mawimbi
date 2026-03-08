import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import AudioService from '../../../services/AudioService';
import Toolbar from '../Toolbar';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;

const mockToggleMixer = vi.fn();
const mockToggleLyrics = vi.fn();
const mockToggleRecording = vi.fn();

const defaultProps = {
  isMixerOpen: false,
  isLyricsOpen: false,
  isEmpty: false,
  onToggleMixer: mockToggleMixer,
  onToggleLyrics: mockToggleLyrics,
  onToggleRecording: mockToggleRecording,
};

afterEach(() => {
  playbackService.reset();
  recordingService.reset();
});

it('renders all buttons', () => {
  const { getAllByRole } = render(<Toolbar {...defaultProps} />);

  expect(getAllByRole('button')).toHaveLength(5);
});

it('disables buttons when tracks are empty', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: true }} />,
  );

  expect(getByTitle('Show lyrics')).toBeDisabled();
  expect(getByTitle('Show mixer')).toBeDisabled();
  expect(getByTitle('Play')).toBeDisabled();
  expect(getByTitle('Rewind')).toBeDisabled();
  expect(getByTitle('Record')).not.toBeDisabled();
});

it('enables non-transport buttons when tracks are not empty', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: false }} />,
  );

  expect(getByTitle('Show lyrics')).toBeEnabled();
  expect(getByTitle('Show mixer')).toBeEnabled();
  expect(getByTitle('Play')).toBeEnabled();
  expect(getByTitle('Record')).toBeEnabled();
});

it('renders play icon when stopped', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const playButton = getByTitle('Play');
  const playIcon = playButton.querySelector('svg');

  expect(playButton).toBeInTheDocument();
  expect(playIcon).toBeInTheDocument();
});

it('renders pause icon when playing', () => {
  playbackService.play();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const pauseButton = getByTitle('Pause');
  const pauseIcon = pauseButton.querySelector('svg');

  expect(pauseButton).toBeInTheDocument();
  expect(pauseIcon).toBeInTheDocument();
});

it('renders microphone icon', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const recordButton = getByTitle('Record');
  const recordIcon = recordButton.querySelector('svg');

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

  expect(playbackService.isPlaying).toBe(true);
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
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Pause')).toBeDisabled();
});

it('disables play/pause button during count-in', () => {
  recordingService.startCountIn();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Play')).toBeDisabled();
});

it('keeps record button enabled during count-in for cancellation', () => {
  recordingService.startCountIn();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Record')).toBeEnabled();
});

it('disables rewind button when stopped', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Rewind')).toBeDisabled();
});

it('enables rewind button when playing', () => {
  playbackService.play();

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Rewind')).toBeEnabled();
});

it('applies active class to lyrics icon when lyrics is open', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isLyricsOpen: true }} />,
  );

  const textButton = getByTitle('Hide lyrics');

  expect(textButton.querySelector('.show-lyrics')).toBeInTheDocument();
});

it('toggles lyrics when lyrics show/hide is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isLyricsOpen: false }} />,
  );

  const textButton = getByTitle('Show lyrics');
  fireEvent.click(textButton);

  expect(mockToggleLyrics).toHaveBeenCalledTimes(1);
});
