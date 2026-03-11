import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import AudioService from '../../../services/AudioService';
import FloatingToolbar from '../FloatingToolbar';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;

const mockToggleRecording = vi.fn();

const defaultProps = {
  isEmpty: false,
  bottomOffset: 60,
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
  expect(getByTitle('Record')).toBeInTheDocument();
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

it('keeps record button enabled during count-in for cancellation', () => {
  recordingService.startCountIn();

  const { getByTitle } = render(<FloatingToolbar {...defaultProps} />);

  expect(getByTitle('Record')).toBeEnabled();
});

it('disables transport buttons when tracks are empty', () => {
  const { getByTitle } = render(
    <FloatingToolbar {...{ ...defaultProps, isEmpty: true }} />,
  );

  expect(getByTitle('Play')).toBeDisabled();
  expect(getByTitle('Rewind')).toBeDisabled();
  expect(getByTitle('Record')).not.toBeDisabled();
});

it('applies bottom offset style', () => {
  const { container } = render(
    <FloatingToolbar {...{ ...defaultProps, bottomOffset: 100 }} />,
  );

  const toolbar = container.querySelector('.floating-toolbar');
  expect(toolbar).toHaveStyle({ bottom: '100px' });
});
