import { isInaccessible } from '@testing-library/dom';
import { act, fireEvent, render } from '@testing-library/react';
import AudioService from '../../../../services/AudioService';
import {
  play,
  resetPlaybackService,
  transportTime,
} from '../../../../services/PlaybackService';
import {
  arm,
  resetRecordingService,
  startCountIn,
  startRecording,
} from '../../../../services/RecordingService';
import { isPlaying } from '../../../../signals/transportSignals';
import Scrubber from '../Scrubber';

const defaultProps = {
  drawerHeight: 0,
  isMixerOpen: false,
  onStopRecording: vi.fn(),
  pixelsPerSecond: 200,
  tracks: [] as import('../../../../types/track').Track[],
};

afterEach(() => {
  resetPlaybackService();
  resetRecordingService();
});

it('hides rewind button at start of playback', () => {
  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  const rewindButtonParent = rewindButton.parentNode;

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButtonParent).toHaveClass('scrubber__rewind--hidden');
});

it('shows rewind button when playback has progressed', () => {
  transportTime.value = 100;

  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  const rewindButtonParent = rewindButton.parentNode;

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButtonParent).not.toHaveClass('scrubber__rewind--hidden');
  expect(isInaccessible(rewindButton)).toEqual(false);
});

it('stops and rewinds playback when rewind button is clicked', () => {
  play();
  transportTime.value = 5.0;

  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  fireEvent.click(rewindButton);

  expect(isPlaying.value).toBe(false);
  expect(transportTime.value).toBe(0);
});

it('pauses playback when timeline is scrolled while playing', () => {
  play();

  const { container } = render(<Scrubber {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.scroll(timeline);

  expect(isPlaying.value).toBe(false);
});

it('does not pause playback when timeline is scrolled while paused', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.scroll(timeline);

  expect(isPlaying.value).toBe(false);
});

it('transforms timeline vertical scale when drawer is open', () => {
  const { container } = render(
    <Scrubber {...{ ...defaultProps, drawerHeight: 120, isMixerOpen: true }} />,
  );

  const progressCursor = container.querySelector('.scrubber__cursor');
  const rewindButton = container.querySelector('.scrubber__rewind');
  const timeline = container.querySelector('.scrubber__timeline');

  expect(timeline).toBeInTheDocument();
  expect(progressCursor).toBeInTheDocument();
  expect(rewindButton).toBeInTheDocument();

  expect(timeline?.outerHTML).toEqual(
    expect.stringContaining('transform: scaleY'),
  );
  expect(progressCursor?.outerHTML).toEqual(
    expect.stringContaining('transform: scaleY'),
  );
  expect(rewindButton?.outerHTML).toEqual(
    expect.stringContaining('transform: translateY'),
  );
});

it('renders plasma playhead canvas in the cursor container', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  const canvas = container.querySelector('.plasma-playhead');

  expect(canvas).toBeInTheDocument();
  expect(canvas?.tagName).toBe('CANVAS');
});

it('feeds plasma renderer with loudness during playback', () => {
  const audioService = AudioService.getInstance();
  vi.spyOn(audioService.mixer, 'getLoudness').mockReturnValue(0.75);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  play();

  render(<Scrubber {...defaultProps} />);

  act(() => {
    rafCallback(0);
  });

  expect(audioService.mixer.getLoudness).toHaveBeenCalled();
});

it('does not stop playback at end of scroll during recording', () => {
  const audioService = AudioService.getInstance();
  vi.spyOn(audioService, 'getTransportTime').mockReturnValue(1.5);
  vi.spyOn(audioService.mixer, 'getLoudness').mockReturnValue(0);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  play();
  arm();
  startRecording();

  render(<Scrubber {...defaultProps} />);

  // In jsdom, scrollWidth equals clientWidth (no overflow), so the
  // end-of-scroll condition is satisfied. During recording this must NOT
  // trigger rewind.
  act(() => {
    rafCallback(0);
  });

  expect(isPlaying.value).toBe(true);
  expect(transportTime.value).toBe(1.5);
});

it('does not call getLoudness when playback is stopped', () => {
  const audioService = AudioService.getInstance();
  const getLoudnessSpy = vi.spyOn(audioService.mixer, 'getLoudness');

  render(<Scrubber {...defaultProps} />);

  expect(getLoudnessSpy).not.toHaveBeenCalled();
});

it('stops recording when timeline is clicked during recording', () => {
  play();
  arm();
  startRecording();
  const onStopRecording = vi.fn();

  const { container } = render(
    <Scrubber {...defaultProps} onStopRecording={onStopRecording} />,
  );

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.click(timeline);

  expect(onStopRecording).toHaveBeenCalledOnce();
  expect(isPlaying.value).toBe(true);
});

it('cancels count-in when timeline is clicked during count-in', () => {
  play();
  arm();
  startRecording();
  startCountIn();
  const onStopRecording = vi.fn();

  const { container } = render(
    <Scrubber {...defaultProps} onStopRecording={onStopRecording} />,
  );

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.click(timeline);

  expect(onStopRecording).toHaveBeenCalledOnce();
  expect(isPlaying.value).toBe(true);
});

it('does not pause playback when timeline is scrolled during recording', () => {
  play();
  arm();
  startRecording();

  const { container } = render(<Scrubber {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.scroll(timeline);

  expect(isPlaying.value).toBe(true);
});

it('does not rewind when rewind button is clicked during recording', () => {
  play();
  arm();
  startRecording();
  transportTime.value = 5.0;

  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  fireEvent.click(getByTitle('Rewind'));

  expect(isPlaying.value).toBe(true);
  expect(transportTime.value).toBe(5.0);
});

it('does not update transportTime during count-in', () => {
  const audioService = AudioService.getInstance();
  vi.spyOn(audioService, 'getTransportTime').mockReturnValue(3.5);
  vi.spyOn(audioService.mixer, 'getLoudness').mockReturnValue(0);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  transportTime.value = 5.0;
  play();
  arm();
  startRecording();
  startCountIn();

  render(<Scrubber {...defaultProps} />);

  act(() => {
    rafCallback(0);
  });

  // transportTime should stay at the pre-count-in value, not update
  // to the current transport position (3.5) during count-in
  expect(transportTime.value).toBe(5.0);
});
