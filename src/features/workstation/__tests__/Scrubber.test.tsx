import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import * as Tone from 'tone';
import AudioService from '../../audio/AudioService';
import { activeRunwayConfig } from '../scrubber/runwayConfig';
import { solveGeometry } from '../scrubber/runwayProjection';
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

/**
 * jsdom's offsetHeight always reads 0, so geometry tests that need a
 * realistic container size mock it on the prototype (matching the pattern
 * `useScrubberGeometry` measures in real browsers).
 */
function mockOffsetHeight(height: number): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return height;
    },
  });
  return () => {
    if (originalDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetHeight',
        originalDescriptor,
      );
    }
  };
}

/** Extracts the trailing `<number>px` token from a `center <y>px` origin string. */
function parseOriginY(origin: string): number {
  return parseFloat(origin.split(' ')[1]);
}

/** Extracts the two `<number>%` gradient stop positions from a `linear-gradient(...)` string. */
function parseGradientPercents(backgroundImage: string): [number, number] {
  const matches = [...backgroundImage.matchAll(/(-?[\d.]+)%/g)].map((m) =>
    parseFloat(m[1]),
  );
  return [matches[0], matches[1]];
}

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

it('derives perspective and tilt styles from the active runway config', () => {
  const containerHeight = 650;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);

  const { container } = render(<Scrubber {...defaultProps} />);

  const viewport = container.querySelector(
    '.scrubber__viewport',
  ) as HTMLElement;
  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  const geometry = solveGeometry(activeRunwayConfig, {
    width: 0,
    height: containerHeight,
  });

  expect(parseFloat(viewport.style.perspective)).toBeCloseTo(
    geometry.perspectivePx,
    6,
  );
  expect(parseOriginY(viewport.style.perspectiveOrigin)).toBeCloseTo(
    geometry.perspectiveOriginY,
    6,
  );
  expect(parseOriginY(tilt.style.transformOrigin)).toBeCloseTo(
    geometry.transformOriginY,
    6,
  );
  expect(tilt.style.transform).toBe(`rotateX(${geometry.rotateXDeg}deg)`);

  restoreOffsetHeight();
});

it('re-solves perspective geometry for the smaller visible area when the drawer opens', () => {
  const containerHeight = 800;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);

  const { container, rerender } = render(<Scrubber {...defaultProps} />);
  const viewport = container.querySelector(
    '.scrubber__viewport',
  ) as HTMLElement;
  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  const closedGeometry = solveGeometry(activeRunwayConfig, {
    width: 0,
    height: containerHeight,
  });
  expect(parseOriginY(tilt.style.transformOrigin)).toBeCloseTo(
    closedGeometry.transformOriginY,
    6,
  );
  expect(parseFloat(viewport.style.perspective)).toBeCloseTo(
    closedGeometry.perspectivePx,
    6,
  );
  expect(parseOriginY(viewport.style.perspectiveOrigin)).toBeCloseTo(
    closedGeometry.perspectiveOriginY,
    6,
  );

  // Open the drawer — geometry re-solves for the smaller visible area
  // (container height minus drawer height), so the origin moves.
  const drawerHeight = 280;
  rerender(<Scrubber {...defaultProps} drawerHeight={drawerHeight} />);

  const openGeometry = solveGeometry(activeRunwayConfig, {
    width: 0,
    height: containerHeight - drawerHeight,
  });
  expect(parseOriginY(tilt.style.transformOrigin)).toBeCloseTo(
    openGeometry.transformOriginY,
    6,
  );
  expect(openGeometry.transformOriginY).not.toBeCloseTo(
    closedGeometry.transformOriginY,
    0,
  );
  // The viewport's own perspective/perspective-origin must also re-solve —
  // not just the tilt element — since both derive from the same geometry.
  expect(parseFloat(viewport.style.perspective)).toBeCloseTo(
    openGeometry.perspectivePx,
    6,
  );
  expect(parseOriginY(viewport.style.perspectiveOrigin)).toBeCloseTo(
    openGeometry.perspectiveOriginY,
    6,
  );
  expect(openGeometry.perspectivePx).not.toBeCloseTo(
    closedGeometry.perspectivePx,
    0,
  );

  restoreOffsetHeight();
});

it('exposes playhead fraction and timeline padding as CSS custom properties on the scrubber element', () => {
  const containerHeight = 650;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);

  const { container } = render(<Scrubber {...defaultProps} />);

  const scrubberEl = container.querySelector('.scrubber') as HTMLElement;
  const geometry = solveGeometry(activeRunwayConfig, {
    width: 0,
    height: containerHeight,
  });
  const expectedSPlayhead =
    geometry.farEdgeS - activeRunwayConfig.runwayLengthPx;
  const expectedPlayheadLocalY = geometry.transformOriginY - expectedSPlayhead;
  const expectedPaddingBottom = containerHeight - expectedPlayheadLocalY;

  expect(
    parseFloat(scrubberEl.style.getPropertyValue('--playhead-fraction')),
  ).toBeCloseTo(activeRunwayConfig.playheadFraction, 6);
  expect(scrubberEl.style.getPropertyValue('--timeline-padding-top')).toBe(
    `${activeRunwayConfig.runwayLengthPx}px`,
  );
  expect(
    parseFloat(scrubberEl.style.getPropertyValue('--timeline-padding-bottom')),
  ).toBeCloseTo(expectedPaddingBottom, 6);

  restoreOffsetHeight();
});

it('disables the 3D tilt when prefers-reduced-motion is set', () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  const restoreOffsetHeight = mockOffsetHeight(650);
  const { container } = render(<Scrubber {...defaultProps} />);
  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  expect(tilt.style.transform).toBe('rotateX(0deg)');

  restoreOffsetHeight();
  window.matchMedia = originalMatchMedia;
});

it('disables the fog overlay when prefers-reduced-motion is set', () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  const restoreOffsetHeight = mockOffsetHeight(650);
  const { container } = render(<Scrubber {...defaultProps} />);
  const fog = container.querySelector('.scrubber__fog') as HTMLElement;

  // A flat plane has no horizon to sell depth toward — the fog must be
  // explicitly disabled rather than merely landing off-screen, since a
  // future retuning of the flat-geometry constants must not resurrect it.
  expect(fog.style.backgroundImage).toBe('none');

  restoreOffsetHeight();
  window.matchMedia = originalMatchMedia;
});

it('renders a fog overlay gradient anchored to the solved horizon', () => {
  const containerHeight = 650;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);

  const { container } = render(<Scrubber {...defaultProps} />);
  const fog = container.querySelector('.scrubber__fog') as HTMLElement;

  const geometry = solveGeometry(activeRunwayConfig, {
    width: 0,
    height: containerHeight,
  });
  const playheadPercent = activeRunwayConfig.playheadFraction * 100;
  const horizonPercent = (geometry.horizonY / containerHeight) * 100;
  const expectedFogStartPercent =
    playheadPercent -
    activeRunwayConfig.fogStartFraction * (playheadPercent - horizonPercent);

  const [actualHorizonPercent, actualFogStartPercent] = parseGradientPercents(
    fog.style.backgroundImage,
  );
  expect(actualHorizonPercent).toBeCloseTo(horizonPercent, 4);
  expect(actualFogStartPercent).toBeCloseTo(expectedFogStartPercent, 4);

  restoreOffsetHeight();
});

it('passes drawer-adjusted visible height as CSS variable to playhead for position alignment', () => {
  const containerHeight = 800;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);
  const drawerHeight = 200;

  const { container } = render(
    <Scrubber {...{ ...defaultProps, drawerHeight }} />,
  );

  const playhead = container.querySelector(
    '.scrubber__playhead',
  ) as HTMLElement;

  // The playhead element must expose --available-height — the same
  // drawer-adjusted visibleHeight useScrubberGeometry solves the runway
  // transform against — computed once in JS rather than re-derived via a
  // separate calc(100% - drawer-height) in CSS.
  const heightVar = playhead.style.getPropertyValue('--available-height');
  expect(heightVar).toBe(`${containerHeight - drawerHeight}px`);
  expect(playhead.style.transform).not.toContain('scaleY');

  restoreOffsetHeight();
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

it('pauses playback when pointer-dragging the phantom scroller during playback animation', () => {
  vi.spyOn(playbackService, 'getEngineTime').mockReturnValue(1.0);
  vi.spyOn(trackService, 'getLoudness').mockReturnValue(0);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  playbackService.play();

  const { container } = render(<Scrubber {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;

  // Mock scroll dimensions so the animation loop doesn't trigger rewind
  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  // The animation loop sets isProgrammaticScrollRef = true when updating
  // scroll position. Without pointer-down tracking, a subsequent user drag
  // scroll event would be mistaken for a programmatic scroll and ignored.
  act(() => {
    rafCallback(0);
  });

  // Simulate a pointer drag: pointerdown → scroll
  fireEvent.pointerDown(phantom);
  fireEvent.scroll(phantom);

  expect(playbackService.isPlaying).toBe(false);
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

it('syncs scroll to beginning when rewinding while paused', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

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

  // Play, then pause at a non-zero position
  playbackService.seekTo(2.5);
  act(() => {
    playbackService.play();
  });
  act(() => {
    playbackService.pause();
  });

  // After pause, scroll should be at transport time 2.5s
  // maxScrollTop = 2000 - 500 = 1500
  // scrollTop = 1500 - (2.5 * 200) = 1000
  expect(phantom.scrollTop).toBe(1000);

  // Rewind while paused
  act(() => {
    playbackService.rewind();
  });

  // Scroll should sync to time 0
  // scrollTop = 1500 - (0 * 200) = 1500
  expect(phantom.scrollTop).toBe(1500);
});

it('shrinks phantom scroller when drawer is open', () => {
  const drawerHeight = 280;
  const { container } = render(
    <Scrubber {...defaultProps} drawerHeight={drawerHeight} />,
  );

  const phantom = container.querySelector('.scrubber__phantom') as HTMLElement;

  expect(phantom.style.bottom).toBe(`${drawerHeight}px`);
});

it('shrinks fog overlay when drawer is open', () => {
  const drawerHeight = 280;
  const { container } = render(
    <Scrubber {...defaultProps} drawerHeight={drawerHeight} />,
  );

  const fog = container.querySelector('.scrubber__fog') as HTMLElement;

  expect(fog.style.bottom).toBe(`${drawerHeight}px`);
});
