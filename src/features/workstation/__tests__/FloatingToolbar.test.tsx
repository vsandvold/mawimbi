import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import AudioService from '../../audio/AudioService';
import FloatingToolbar from '../FloatingToolbar';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;

const mockRewind = vi.fn();
const mockToggleRecording = vi.fn();

const defaultProps = {
  isEmpty: false,
  isRecordingOpen: false,
  isRecordingLocked: false,
  onRewind: mockRewind,
  onToggleRecording: mockToggleRecording,
};

afterEach(() => {
  playbackService.reset();
  recordingService.reset();
});

it('renders rewind, play, and record buttons', () => {
  const { getByTitle } = render(<FloatingToolbar {...defaultProps} />);

  expect(getByTitle('Rewind')).toBeInTheDocument();
  expect(getByTitle('Play')).toBeInTheDocument();
  expect(getByTitle('Show recording')).toBeInTheDocument();
});

it('shows "Hide recording" when the drawer is open', () => {
  const { getByTitle } = render(
    <FloatingToolbar {...defaultProps} isRecordingOpen={true} />,
  );

  expect(getByTitle('Hide recording')).toBeInTheDocument();
});

it('renders pause icon when playing', () => {
  playbackService.play();

  const { getByTitle } = render(<FloatingToolbar {...defaultProps} />);

  expect(getByTitle('Pause')).toBeInTheDocument();
});

it('toggles playback when play/pause button is clicked', () => {
  const { getByTitle } = render(<FloatingToolbar {...defaultProps} />);

  fireEvent.click(getByTitle('Play'));

  expect(playbackService.isPlaying).toBe(true);
});

it('disables play/pause button while recording', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();

  const { getByTitle } = render(<FloatingToolbar {...defaultProps} />);

  expect(getByTitle('Pause')).toBeDisabled();
});

it('disables play/pause button during count-in', () => {
  recordingService.startCountIn();

  const { getByTitle } = render(<FloatingToolbar {...defaultProps} />);

  expect(getByTitle('Play')).toBeDisabled();
});

it('disables the recording drawer toggle while counting in or recording — cancellation happens in the drawer', () => {
  const { getByTitle } = render(
    <FloatingToolbar
      {...defaultProps}
      isRecordingOpen={true}
      isRecordingLocked={true}
    />,
  );

  expect(getByTitle('Hide recording')).toBeDisabled();
});

it('keeps the recording drawer toggle enabled when idle, even with empty tracks', () => {
  const { getByTitle } = render(
    <FloatingToolbar {...{ ...defaultProps, isEmpty: true }} />,
  );

  expect(getByTitle('Play')).toBeDisabled();
  expect(getByTitle('Rewind')).toBeDisabled();
  expect(getByTitle('Show recording')).not.toBeDisabled();
});

it('calls onRewind when rewind button is clicked', () => {
  const { getByTitle } = render(<FloatingToolbar {...defaultProps} />);

  fireEvent.click(getByTitle('Rewind'));

  expect(mockRewind).toHaveBeenCalledOnce();
});

it('applies floating-button-group class', () => {
  const { container } = render(<FloatingToolbar {...defaultProps} />);

  const toolbar = container.querySelector('.floating-toolbar');
  expect(toolbar).toHaveClass('floating-button-group');
});
