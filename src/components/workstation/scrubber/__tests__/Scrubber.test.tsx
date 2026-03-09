import { isInaccessible } from '@testing-library/dom';
import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import * as Tone from 'tone';
import AudioService from '../../../../services/AudioService';
import Scrubber, { type ScrubberHandle } from '../Scrubber';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;
const trackService = audioService.trackService;

const defaultProps = {
  drawerHeight: 0,
  isMixerOpen: false,
  onStopRecording: vi.fn(),
  pixelsPerSecond: 200,
  tracks: [] as import('../../../../types/track').Track[],
};

afterEach(() => {
  playbackService.reset();
  recordingService.reset();
  Tone.getTransport().seconds = 0;
});

it('hides rewind button at start of playback', () => {
  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  const rewindButtonParent = rewindButton.parentNode;

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButtonParent).toHaveClass('scrubber__rewind--hidden');
});

it('shows rewind button when playback has progressed', () => {
  playbackService.setTransportTime(100);

  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  const rewindButtonParent = rewindButton.parentNode;

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButtonParent).not.toHaveClass('scrubber__rewind--hidden');
  expect(isInaccessible(rewindButton)).toEqual(false);
});

it('stops and rewinds playback when rewind button is clicked', () => {
  playbackService.play();
  playbackService.setTransportTime(5.0);

  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  fireEvent.click(rewindButton);

  expect(playbackService.isPlaying).toBe(false);
  expect(playbackService.transportTime).toBe(0);
});

it('pauses playback when timeline is scrolled while playing', () => {
  playbackService.play();

  const { container } = render(<Scrubber {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.scroll(timeline);

  expect(playbackService.isPlaying).toBe(false);
});

it('does not pause playback when timeline is scrolled while paused', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.scroll(timeline);

  expect(playbackService.isPlaying).toBe(false);
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

it('does not stop playback at end of scroll during recording', () => {
  vi.spyOn(playbackService, 'getEngineTime').mockReturnValue(1.5);
  vi.spyOn(trackService, 'getLoudness').mockReturnValue(0);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();

  render(<Scrubber {...defaultProps} />);

  // In jsdom, scrollWidth equals clientWidth (no overflow), so the
  // end-of-scroll condition is satisfied. During recording this must NOT
  // trigger rewind.
  act(() => {
    rafCallback(0);
  });

  expect(playbackService.isPlaying).toBe(true);
  expect(playbackService.transportTime).toBe(1.5);
});

it('stops recording when timeline is clicked during recording', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();
  const onStopRecording = vi.fn();

  const { container } = render(
    <Scrubber {...defaultProps} onStopRecording={onStopRecording} />,
  );

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.click(timeline);

  expect(onStopRecording).toHaveBeenCalledOnce();
  expect(playbackService.isPlaying).toBe(true);
});

it('cancels count-in when timeline is clicked during count-in', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();
  recordingService.startCountIn();
  const onStopRecording = vi.fn();

  const { container } = render(
    <Scrubber {...defaultProps} onStopRecording={onStopRecording} />,
  );

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.click(timeline);

  expect(onStopRecording).toHaveBeenCalledOnce();
  expect(playbackService.isPlaying).toBe(true);
});

it('does not pause playback when timeline is scrolled during recording', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();

  const { container } = render(<Scrubber {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.scroll(timeline);

  expect(playbackService.isPlaying).toBe(true);
});

it('does not rewind when rewind button is clicked during recording', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();
  playbackService.setTransportTime(5.0);

  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  fireEvent.click(getByTitle('Rewind'));

  expect(playbackService.isPlaying).toBe(true);
  expect(playbackService.transportTime).toBe(5.0);
});

it('does not update transportTime during count-in', () => {
  vi.spyOn(playbackService, 'getEngineTime').mockReturnValue(3.5);
  vi.spyOn(trackService, 'getLoudness').mockReturnValue(0);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  playbackService.setTransportTime(5.0);
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();
  recordingService.startCountIn();

  render(<Scrubber {...defaultProps} />);

  act(() => {
    rafCallback(0);
  });

  // transportTime should stay at the pre-count-in value, not update
  // to the current transport position (3.5) during count-in
  expect(playbackService.transportTime).toBe(5.0);
});

it('syncs timeline scroll position via imperative handle', () => {
  const ref = createRef<ScrubberHandle>();

  const { container } = render(<Scrubber ref={ref} {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;

  act(() => {
    ref.current!.syncScrollToTime(2.5);
  });

  // scrollTop = time * pixelsPerSecond = 2.5 * 200 = 500
  expect(timeline.scrollTop).toBe(500);
});
