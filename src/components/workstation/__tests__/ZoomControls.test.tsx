import { fireEvent, render } from '@testing-library/react';
import AudioService from '../../../services/AudioService';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  pixelsPerSecond,
  resetWorkstationSignals,
} from '../../../signals/workstationSignals';
import ZoomControls from '../ZoomControls';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;

afterEach(() => {
  resetWorkstationSignals();
  playbackService.reset();
  recordingService.reset();
});

it('renders zoom in and zoom out buttons', () => {
  const { getByTitle } = render(<ZoomControls />);

  expect(getByTitle('Zoom in')).toBeInTheDocument();
  expect(getByTitle('Zoom out')).toBeInTheDocument();
});

it('increases zoom when zoom in is clicked', () => {
  const before = pixelsPerSecond.value;
  const { getByTitle } = render(<ZoomControls />);

  fireEvent.click(getByTitle('Zoom in'));

  expect(pixelsPerSecond.value).toBeGreaterThan(before);
});

it('decreases zoom when zoom out is clicked', () => {
  const before = pixelsPerSecond.value;
  const { getByTitle } = render(<ZoomControls />);

  fireEvent.click(getByTitle('Zoom out'));

  expect(pixelsPerSecond.value).toBeLessThan(before);
});

it('disables zoom in at maximum zoom', () => {
  pixelsPerSecond.value = MAX_PIXELS_PER_SECOND;
  const { getByTitle } = render(<ZoomControls />);

  expect(getByTitle('Zoom in')).toBeDisabled();
});

it('disables zoom out at minimum zoom', () => {
  pixelsPerSecond.value = MIN_PIXELS_PER_SECOND;
  const { getByTitle } = render(<ZoomControls />);

  expect(getByTitle('Zoom out')).toBeDisabled();
});

it('disables both zoom buttons during recording', () => {
  recordingService.arm();
  const { getByTitle } = render(<ZoomControls />);

  expect(getByTitle('Zoom in')).toBeDisabled();
  expect(getByTitle('Zoom out')).toBeDisabled();
});
