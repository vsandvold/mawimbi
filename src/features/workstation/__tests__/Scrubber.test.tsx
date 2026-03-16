import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import * as Tone from 'tone';
import AudioService from '../../audio/AudioService';
import Scrubber, { type ScrubberHandle } from '../scrubber/Scrubber';

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

it('pauses playback when phantom scroller is scrolled while playing', () => {
  playbackService.play();

  const { container } = render(<Scrubber {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  fireEvent.scroll(phantom);

  expect(playbackService.isPlaying).toBe(false);
});

it('does not pause playback when phantom scroller is scrolled while paused', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  fireEvent.scroll(phantom);

  expect(playbackService.isPlaying).toBe(false);
});

it('positions perspective-origin and transform-origin at scrubber bottom', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  const viewport = container.querySelector(
    '.scrubber__viewport',
  ) as HTMLElement;
  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  // Both origins should use the same Y coordinate (scrubber bottom).
  // In jsdom offsetHeight is 0, so scrubberBottomY = 0.75 * 0 = 0.
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

  const { container, rerender } = render(<Scrubber {...defaultProps} />);

  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  const transformWithoutDrawer = tilt.style.transform;

  // Open the drawer — the perspective geometry should NOT change
  rerender(<Scrubber {...defaultProps} drawerHeight={280} />);

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
    <Scrubber {...defaultProps} drawerHeight={drawerHeight} />,
  );

  const viewport = container.querySelector(
    '.scrubber__viewport',
  ) as HTMLElement;

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
  const { container } = render(<Scrubber {...defaultProps} drawerHeight={0} />);

  const viewport = container.querySelector(
    '.scrubber__viewport',
  ) as HTMLElement;

  expect(viewport.style.transform).toBe('');
});

it('does not render a shade overlay', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  expect(container.querySelector('.scrubber__shade')).toBeNull();
});

it('passes drawer height as CSS variable to playhead for position alignment', () => {
  const drawerHeight = 200;

  const { container } = render(
    <Scrubber {...{ ...defaultProps, drawerHeight }} />,
  );

  const playhead = container.querySelector(
    '.scrubber__playhead',
  ) as HTMLElement;

  // The playhead element must expose --drawer-height so CSS can position the
  // playhead within the visible area above the drawer.
  const heightVar = playhead.style.getPropertyValue('--drawer-height');
  expect(heightVar).toBe(`${drawerHeight}px`);
  expect(playhead.style.transform).not.toContain('scaleY');
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

it('stops recording when phantom scroller is clicked during recording', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();
  const onStopRecording = vi.fn();

  const { container } = render(
    <Scrubber {...defaultProps} onStopRecording={onStopRecording} />,
  );

  const phantom = container.querySelector('.scrubber__phantom')!;
  fireEvent.click(phantom);

  expect(onStopRecording).toHaveBeenCalledOnce();
  expect(playbackService.isPlaying).toBe(true);
});

it('cancels count-in when phantom scroller is clicked during count-in', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();
  recordingService.startCountIn();
  const onStopRecording = vi.fn();

  const { container } = render(
    <Scrubber {...defaultProps} onStopRecording={onStopRecording} />,
  );

  const phantom = container.querySelector('.scrubber__phantom')!;
  fireEvent.click(phantom);

  expect(onStopRecording).toHaveBeenCalledOnce();
  expect(playbackService.isPlaying).toBe(true);
});

it('does not pause playback when phantom scroller is scrolled during recording', () => {
  playbackService.play();
  recordingService.arm();
  recordingService.startRecording();

  const { container } = render(<Scrubber {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  fireEvent.scroll(phantom);

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

  render(<Scrubber {...defaultProps} />);

  act(() => {
    rafCallback(0);
  });

  // transportTime should stay at the pre-count-in value, not update
  // to the current transport position (3.5) during count-in
  expect(playbackService.transportTime).toBe(5.0);
});

it('syncs timeline scroll position via imperative handle (inverted scroll)', () => {
  const ref = createRef<ScrubberHandle>();

  const { container } = render(<Scrubber ref={ref} {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  const tilt = container.querySelector('.scrubber__tilt')!;

  // Mock scroll dimensions so maxScrollTop is non-zero
  for (const el of [phantom, tilt]) {
    Object.defineProperty(el, 'scrollHeight', {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(el, 'clientHeight', {
      value: 500,
      configurable: true,
    });
  }

  act(() => {
    ref.current!.syncScrollToTime(2.5);
  });

  // Inverted scroll: scrollTop = maxScrollTop - time * pixelsPerSecond
  // maxScrollTop = 2000 - 500 = 1500
  // scrollTop = 1500 - (2.5 * 200) = 1500 - 500 = 1000
  expect(phantom.scrollTop).toBe(1000);
  // Tilt container is synced so spectrograms can read scrollTop
  expect(tilt.scrollTop).toBe(1000);
});

it('scrolls to maxScrollTop when time is zero (beginning at bottom)', () => {
  const ref = createRef<ScrubberHandle>();

  const { container } = render(<Scrubber ref={ref} {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  const tilt = container.querySelector('.scrubber__tilt')!;

  for (const el of [phantom, tilt]) {
    Object.defineProperty(el, 'scrollHeight', {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(el, 'clientHeight', {
      value: 500,
      configurable: true,
    });
  }

  act(() => {
    ref.current!.syncScrollToTime(0);
  });

  // At time=0, scrollTop should be at max (beginning at bottom)
  expect(phantom.scrollTop).toBe(1500);
  expect(tilt.scrollTop).toBe(1500);
});

it('shrinks phantom scroller when drawer is open', () => {
  const drawerHeight = 280;
  const { container } = render(
    <Scrubber {...defaultProps} drawerHeight={drawerHeight} />,
  );

  const phantom = container.querySelector('.scrubber__phantom') as HTMLElement;

  expect(phantom.style.bottom).toBe(`${drawerHeight}px`);
});
