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

it('renders plasma playhead canvas in the cursor container', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  const canvas = container.querySelector('.plasma-playhead');

  expect(canvas).toBeInTheDocument();
  expect(canvas?.tagName).toBe('CANVAS');
});

it('renders idle playhead after cursor container is resized', () => {
  // Override the no-op ResizeObserver stub to capture all callbacks
  const resizeCallbacks: ResizeObserverCallback[] = [];
  const OriginalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class MockResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      resizeCallbacks.push(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  // Mock getContext to return a minimal context so renderIdle can draw
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const getContextSpy = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: '',
    createLinearGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
  });
  HTMLCanvasElement.prototype.getContext = getContextSpy;

  try {
    const { container } = render(<Scrubber {...defaultProps} />);

    const canvas = container.querySelector(
      '.plasma-playhead',
    ) as HTMLCanvasElement;
    expect(canvas).toBeInTheDocument();

    // Clear the getContext calls from mounting
    getContextSpy.mockClear();

    // Simulate the ResizeObserver firing (container gains height)
    // Fire all registered callbacks since the cursor observer may not
    // be the last one registered.
    act(() => {
      for (const cb of resizeCallbacks) {
        cb(
          [
            { contentRect: { height: 400 } },
          ] as unknown as ResizeObserverEntry[],
          {} as ResizeObserver,
        );
      }
    });

    // renderIdle should have been called, which calls getContext to draw
    expect(getContextSpy).toHaveBeenCalled();
  } finally {
    globalThis.ResizeObserver = OriginalResizeObserver;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
});

it('feeds plasma renderer with loudness during playback', () => {
  vi.spyOn(trackService, 'getLoudness').mockReturnValue(0.75);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  playbackService.play();

  render(<Scrubber {...defaultProps} />);

  act(() => {
    rafCallback(0);
  });

  expect(trackService.getLoudness).toHaveBeenCalled();
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

it('does not call getLoudness when playback is stopped', () => {
  const getLoudnessSpy = vi.spyOn(trackService, 'getLoudness');

  render(<Scrubber {...defaultProps} />);

  expect(getLoudnessSpy).not.toHaveBeenCalled();
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

it('recalculates timeline scale when container resizes with mixer open', () => {
  // Capture all ResizeObserver callbacks so we can trigger them manually
  const observerCallbacks: ResizeObserverCallback[] = [];
  const observedElements: Element[] = [];
  const OriginalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class MockResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      observerCallbacks.push(cb);
    }
    observe(el: Element) {
      observedElements.push(el);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  // Mock offsetHeight on the timeline scroll container to simulate height change
  let mockOffsetHeight = 600;
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return mockOffsetHeight;
    },
  });

  try {
    const { container } = render(
      <Scrubber
        {...{ ...defaultProps, drawerHeight: 120, isMixerOpen: true }}
      />,
    );

    const timeline = container.querySelector('.scrubber__timeline');

    // Initial scale: (600 - 120) / 600 = 0.8
    expect(timeline?.outerHTML).toEqual(expect.stringContaining('scaleY(0.8)'));

    // Simulate entering fullscreen — container height increases to 900
    mockOffsetHeight = 900;

    // Fire all ResizeObserver callbacks to simulate the resize
    act(() => {
      for (const cb of observerCallbacks) {
        cb(
          [
            { contentRect: { height: 900 } },
          ] as unknown as ResizeObserverEntry[],
          {} as ResizeObserver,
        );
      }
    });

    // Scale should now be (900 - 120) / 900 ≈ 0.867
    expect(timeline?.outerHTML).toEqual(expect.stringContaining('scaleY(0.8'));
    expect(timeline?.outerHTML).not.toEqual(
      expect.stringContaining('scaleY(0.8)'),
    );
  } finally {
    globalThis.ResizeObserver = OriginalResizeObserver;
    if (originalDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetHeight',
        originalDescriptor,
      );
    }
  }
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

  // scrollLeft = time * pixelsPerSecond = 2.5 * 200 = 500
  expect(timeline.scrollLeft).toBe(500);
});
