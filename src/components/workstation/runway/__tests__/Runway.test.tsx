import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import * as Tone from 'tone';
import AudioService from '../../../../services/AudioService';
import Runway, { type RunwayHandle } from '../Runway';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;
const trackService = audioService.trackService;

const defaultProps = {
  drawerHeight: 0,
  isMixerOpen: false,
  onStopRecording: vi.fn(),
  pixelsPerSecond: 200,
};

afterEach(() => {
  playbackService.reset();
  recordingService.reset();
  Tone.getTransport().seconds = 0;
});

it('pauses playback when timeline is scrolled while playing', () => {
  playbackService.play();

  const { container } = render(<Runway {...defaultProps} />);

  const timeline = container.querySelector('.runway__tilt')!;
  fireEvent.scroll(timeline);

  expect(playbackService.isPlaying).toBe(false);
});

it('does not pause playback when timeline is scrolled while paused', () => {
  const { container } = render(<Runway {...defaultProps} />);

  const timeline = container.querySelector('.runway__tilt')!;
  fireEvent.scroll(timeline);

  expect(playbackService.isPlaying).toBe(false);
});

it('positions perspective-origin and transform-origin at runway bottom', () => {
  const { container } = render(<Runway {...defaultProps} />);

  const viewport = container.querySelector('.runway__viewport') as HTMLElement;
  const tilt = container.querySelector('.runway__tilt') as HTMLElement;

  // Both origins should use the same Y coordinate (runway bottom).
  // In jsdom offsetHeight is 0, so runwayBottomY = 0.75 * 0 = 0.
  expect(viewport.style.perspectiveOrigin).toBe('center 0px');
  expect(tilt.style.transformOrigin).toBe('center 0px');
});

it('keeps perspective geometry stable when drawer height changes', () => {
  // Mock offsetHeight so the layout effect reads a non-zero container height
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return 800;
    },
  });

  const { container, rerender } = render(<Runway {...defaultProps} />);

  const tilt = container.querySelector('.runway__tilt') as HTMLElement;

  const transformWithoutDrawer = tilt.style.transform;

  // Open the drawer — the perspective geometry should NOT change
  rerender(<Runway {...defaultProps} drawerHeight={280} />);

  const transformWithDrawer = tilt.style.transform;

  expect(transformWithDrawer).toBe(transformWithoutDrawer);

  // Restore
  if (originalDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'offsetHeight',
      originalDescriptor,
    );
  }
});

it('applies translateY and scaleY to viewport div when drawer is open', () => {
  const containerHeight = 800;
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return containerHeight;
    },
  });

  const drawerHeight = 280;
  const { container } = render(
    <Runway {...defaultProps} drawerHeight={drawerHeight} />,
  );

  const viewport = container.querySelector('.runway__viewport') as HTMLElement;

  const visibleHeight = containerHeight - drawerHeight;
  const expectedScaleY = visibleHeight / containerHeight;
  const expectedTranslateY = -drawerHeight / 2;

  expect(viewport.style.transform).toBe(
    `translateY(${expectedTranslateY}px) scaleY(${expectedScaleY})`,
  );

  if (originalDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'offsetHeight',
      originalDescriptor,
    );
  }
});

it('does not apply viewport transform when drawer is closed', () => {
  const { container } = render(<Runway {...defaultProps} drawerHeight={0} />);

  const viewport = container.querySelector('.runway__viewport') as HTMLElement;

  expect(viewport.style.transform).toBe('');
});

it('does not render a shade overlay', () => {
  const { container } = render(<Runway {...defaultProps} />);

  expect(container.querySelector('.runway__shade')).toBeNull();
});

it('passes drawer height as CSS variable to playhead for position alignment', () => {
  const drawerHeight = 200;

  const { container } = render(
    <Runway {...{ ...defaultProps, drawerHeight }} />,
  );

  const playhead = container.querySelector('.runway__playhead') as HTMLElement;

  // The playhead element must expose --drawer-height so CSS can position the
  // playhead within the visible area above the drawer.
  const heightVar = playhead.style.getPropertyValue('--drawer-height');
  expect(heightVar).toBe(`${drawerHeight}px`);
  expect(playhead.style.transform).not.toContain('scaleY');
});

it('viewport wrapper handles wheel events for full hit-area coverage', () => {
  playbackService.play();

  const { container } = render(<Runway {...defaultProps} />);

  // The viewport wrapper covers the full rectangular area. Wheel events
  // landing outside the tilted scroll container's trapezoid hit the wrapper
  // instead, which forwards them as programmatic scrolls.
  const viewport = container.querySelector('.runway__viewport')!;
  fireEvent.wheel(viewport, { deltaY: 100 });

  expect(playbackService.isPlaying).toBe(false);
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

  render(<Runway {...defaultProps} />);

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
    <Runway {...defaultProps} onStopRecording={onStopRecording} />,
  );

  const timeline = container.querySelector('.runway__tilt')!;
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
    <Runway {...defaultProps} onStopRecording={onStopRecording} />,
  );

  const timeline = container.querySelector('.runway__tilt')!;
  fireEvent.click(timeline);

  expect(onStopRecording).toHaveBeenCalledOnce();
  expect(playbackService.isPlaying).toBe(true);
});

it('does not pause playback when timeline is scrolled during recording', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();

  const { container } = render(<Runway {...defaultProps} />);

  const timeline = container.querySelector('.runway__tilt')!;
  fireEvent.scroll(timeline);

  expect(playbackService.isPlaying).toBe(true);
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

  render(<Runway {...defaultProps} />);

  act(() => {
    rafCallback(0);
  });

  // transportTime should stay at the pre-count-in value, not update
  // to the current transport position (3.5) during count-in
  expect(playbackService.transportTime).toBe(5.0);
});

it('syncs timeline scroll position via imperative handle (inverted scroll)', () => {
  const ref = createRef<RunwayHandle>();

  const { container } = render(<Runway ref={ref} {...defaultProps} />);

  const timeline = container.querySelector('.runway__tilt')!;

  // Mock scroll dimensions so maxScrollTop is non-zero
  Object.defineProperty(timeline, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(timeline, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    ref.current!.syncScrollToTime(2.5);
  });

  // Inverted scroll: scrollTop = maxScrollTop - time * pixelsPerSecond
  // maxScrollTop = 2000 - 500 = 1500
  // scrollTop = 1500 - (2.5 * 200) = 1500 - 500 = 1000
  expect(timeline.scrollTop).toBe(1000);
});

it('scrolls to maxScrollTop when time is zero (beginning at bottom)', () => {
  const ref = createRef<RunwayHandle>();

  const { container } = render(<Runway ref={ref} {...defaultProps} />);

  const timeline = container.querySelector('.runway__tilt')!;

  Object.defineProperty(timeline, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(timeline, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    ref.current!.syncScrollToTime(0);
  });

  // At time=0, scrollTop should be at max (beginning at bottom)
  expect(timeline.scrollTop).toBe(1500);
});
