import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import * as Tone from 'tone';
import AudioService from '../../audio/AudioService';
import {
  enterEditMode,
  getActiveEditTrackId,
  resetEditModeSignals,
} from '../editModeSignals';
import { activeRunwayConfig, beatSaber } from '../scrubber/runwayConfig';
import { solveGeometry } from '../scrubber/runwayProjection';
import {
  resetTuningSignals,
  setTuningValue,
  toggleTuningOverlay,
} from '../scrubber/tuningSignals';
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
  tracks: [],
};

const twoTracks = [
  { trackId: 'track-1', color: { r: 0, g: 0, b: 0 }, fileName: 'a', index: 0 },
  { trackId: 'track-2', color: { r: 0, g: 0, b: 0 }, fileName: 'b', index: 1 },
];

// Margin above useScrubberScroll's SCROLL_DEBOUNCE_MS (200ms) so fake-timer
// advances reliably clear the debounce without depending on its exact value.
const PAST_SCROLL_DEBOUNCE_MS = 250;

afterEach(() => {
  playbackService.reset();
  recordingService.reset();
  Tone.getTransport().seconds = 0;
  // Wrapped in act() — this writes tuningSignals/editModeSignals, which
  // useScrubberGeometry/the track-cycle gesture subscribe to, and RTL's own
  // unmount cleanup (registered before this afterEach) hasn't necessarily
  // run yet for the current test's tree.
  act(() => {
    resetTuningSignals();
    resetEditModeSignals();
  });
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

/**
 * Renders the Scrubber with a scrollable phantom (mocked scrollHeight/
 * clientHeight, since jsdom always reports 0), then drives a drag gesture
 * that crosses the scrub movement threshold and releases — pausing
 * playback and arming its debounced auto-resume.
 */
function renderAndArmScrubResume(): HTMLElement {
  const { container } = render(<Scrubber {...defaultProps} />);
  const phantom = container.querySelector('.scrubber__phantom')!;
  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  fireEvent.pointerDown(phantom, { clientY: 0 });
  fireEvent.pointerMove(phantom, { clientY: 20 });
  fireEvent.pointerUp(phantom);

  return phantom as HTMLElement;
}

it('pauses playback on a real wheel scrub while playing', () => {
  playbackService.play();

  const { container } = render(<Scrubber {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  fireEvent.wheel(phantom, { deltaY: 100 });

  expect(playbackService.isPlaying).toBe(false);
});

// A bare `scroll` event with no preceding wheel/pointer-drag input is
// exactly what the animation loop's own scrollTop writes generate — the
// gesture model (scrubGesture.ts) must never infer a scrub from it alone,
// or playback would misread its own writes as a user scrub (mawimbi#472's
// stutter loop).
it('does not pause playback on a bare scroll event with no preceding gesture input', () => {
  playbackService.play();

  const { container } = render(<Scrubber {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  fireEvent.scroll(phantom);

  expect(playbackService.isPlaying).toBe(true);
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

it('re-solves geometry from the tuning overlay override when active', () => {
  const containerHeight = 650;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);

  toggleTuningOverlay(activeRunwayConfig);
  setTuningValue('tiltDeg', 20);

  const { container } = render(<Scrubber {...defaultProps} />);
  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  const overriddenGeometry = solveGeometry(
    { ...activeRunwayConfig, tiltDeg: 20 },
    { width: 0, height: containerHeight },
  );

  expect(tilt.style.transform).toBe(
    `rotateX(${overriddenGeometry.rotateXDeg}deg)`,
  );

  restoreOffsetHeight();
});

it('reverts to the active preset once the tuning overlay closes', () => {
  const containerHeight = 650;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);

  toggleTuningOverlay(activeRunwayConfig);
  setTuningValue('tiltDeg', 20);
  // Second toggleTuningOverlay call closes the overlay and clears the override.
  toggleTuningOverlay(activeRunwayConfig);

  const { container } = render(<Scrubber {...defaultProps} />);
  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  const activeGeometry = solveGeometry(activeRunwayConfig, {
    width: 0,
    height: containerHeight,
  });

  expect(tilt.style.transform).toBe(`rotateX(${activeGeometry.rotateXDeg}deg)`);

  restoreOffsetHeight();
});

it('renders the tuning overlay once opened via toggleTuningOverlay', () => {
  const restoreOffsetHeight = mockOffsetHeight(650);

  toggleTuningOverlay(activeRunwayConfig);

  const { container } = render(<Scrubber {...defaultProps} />);

  expect(container.querySelector('.tuning-overlay')).not.toBeNull();

  restoreOffsetHeight();
});

it('selects beatSaber preset via the tuning overlay and re-solves geometry', () => {
  const containerHeight = 650;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);

  toggleTuningOverlay(beatSaber);

  const { container } = render(<Scrubber {...defaultProps} />);
  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  const beatSaberGeometry = solveGeometry(beatSaber, {
    width: 0,
    height: containerHeight,
  });

  expect(tilt.style.transform).toBe(
    `rotateX(${beatSaberGeometry.rotateXDeg}deg)`,
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

it('does not flatten geometry for prefers-reduced-motion while the tuning overlay is active', () => {
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

  // Opening the tuning overlay is an explicit request to see the real 3D
  // effect — without this, every slider would look like a no-op to a
  // developer who happens to have this OS accessibility preference set.
  toggleTuningOverlay(activeRunwayConfig);
  setTuningValue('tiltDeg', 45);

  const containerHeight = 650;
  const restoreOffsetHeight = mockOffsetHeight(containerHeight);
  const { container } = render(<Scrubber {...defaultProps} />);
  const tilt = container.querySelector('.scrubber__tilt') as HTMLElement;

  const tunedGeometry = solveGeometry(
    { ...activeRunwayConfig, tiltDeg: 45 },
    { width: 0, height: containerHeight },
  );

  expect(tilt.style.transform).toBe(`rotateX(${tunedGeometry.rotateXDeg}deg)`);
  expect(tilt.style.transform).not.toBe('rotateX(0deg)');

  restoreOffsetHeight();
  window.matchMedia = originalMatchMedia;
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

it('stops playback via the end-of-scroll fallback when totalTime is 0 mid-playback', () => {
  vi.spyOn(playbackService, 'getEngineTime').mockReturnValue(2.0);
  vi.spyOn(trackService, 'getLoudness').mockReturnValue(0);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  playbackService.play();
  // totalTime is left at its default 0 (e.g. the last track was removed
  // mid-playback) — isAtEndOfTimeline's `totalTime > 0` guard means the
  // primary end-of-timeline mechanism inside setTransportTime can never
  // fire, so the end-of-scroll fallback must stop playback on its own
  // rather than leaving the loop reporting "playing" forever.

  render(<Scrubber {...defaultProps} />);

  // jsdom's scrollHeight === clientHeight (no overflow), so the end-of-scroll
  // fallback's `scrollTop <= 0` condition is trivially satisfied.
  act(() => {
    rafCallback(0);
  });

  expect(playbackService.isPlaying).toBe(false);
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

  // The animation loop writes scrollTop every frame; the gesture model must
  // not mistake that write's own `scroll` event for the user's drag.
  act(() => {
    rafCallback(0);
  });

  // Simulate a pointer drag: pointerdown → movement past the gesture
  // threshold → scroll. A resting pointerdown with no movement (G4) must
  // not enter a gesture — see the companion "resting finger" test below.
  fireEvent.pointerDown(phantom, { clientY: 0 });
  fireEvent.pointerMove(phantom, { clientY: 20 });
  fireEvent.scroll(phantom);

  expect(playbackService.isPlaying).toBe(false);
});

it('does not pause playback for a resting pointerdown with no movement (G4)', () => {
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

  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    rafCallback(0);
  });

  // A tap holds the pointer down for a frame or two with no movement — the
  // animation loop's own scroll writes during that window must not be
  // misread as a scrub (this was the tap-misfire's root cause, mawimbi#472).
  fireEvent.pointerDown(phantom, { clientY: 0 });
  fireEvent.scroll(phantom);

  expect(playbackService.isPlaying).toBe(true);
});

it('does not pause playback during a two-finger touch (pinch groundwork, G5)', () => {
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

  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    rafCallback(0);
  });

  // A pinch's two touches each generate their own pointer events on the
  // phantom (useTimelineZoom.ts's touchmove preventDefault() suppresses the
  // native scroll, but not the parallel pointermove events) — a second
  // pointer joining must suppress gesture entry entirely, or pinching would
  // spuriously pause playback.
  fireEvent.pointerDown(phantom, { clientY: 0, pointerId: 1 });
  fireEvent.pointerDown(phantom, { clientY: 0, pointerId: 2 });
  fireEvent.pointerMove(phantom, { clientY: 30, pointerId: 1 });
  fireEvent.scroll(phantom);

  expect(playbackService.isPlaying).toBe(true);
});

it('recognizes a single-finger drag again once a two-finger touch fully lifts', () => {
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

  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    rafCallback(0);
  });

  // Both touches lift (pinch ends) — the pointer count must not stay
  // wedged above zero, or every future single-finger drag would be
  // silently ignored as "still multi-touch".
  fireEvent.pointerDown(phantom, { clientY: 0, pointerId: 1 });
  fireEvent.pointerDown(phantom, { clientY: 0, pointerId: 2 });
  fireEvent.pointerUp(phantom, { pointerId: 2 });
  fireEvent.pointerUp(phantom, { pointerId: 1 });

  fireEvent.pointerDown(phantom, { clientY: 0, pointerId: 3 });
  fireEvent.pointerMove(phantom, { clientY: 30, pointerId: 3 });
  fireEvent.scroll(phantom);

  expect(playbackService.isPlaying).toBe(false);
});

it('recovers single-finger scrubbing after a pinch ends via touchcancel, not just touchend', () => {
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

  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    rafCallback(0);
  });

  // useTimelineZoom is the real (unmocked) hook here. A pinch that ends via
  // touchcancel (OS gesture takeover, incoming call, permission prompt) has
  // no matching touchend — without a touchcancel listener of its own,
  // isPinchingRef would stick true forever (mawimbi#476), and the scrub
  // controller's isPinchingRef check would then silently swallow every
  // later single-finger drag: it would look identical to "no gesture
  // happened" (isPlaying staying true) rather than an assertion failure,
  // which is why this checks the drag actually still pauses.
  fireEvent.touchStart(phantom, {
    touches: [
      { clientX: 0, clientY: 0 },
      { clientX: 0, clientY: 40 },
    ],
  });
  fireEvent.touchCancel(phantom, { touches: [] });

  fireEvent.pointerDown(phantom, { clientY: 0 });
  fireEvent.pointerMove(phantom, { clientY: 30 });

  expect(playbackService.isPlaying).toBe(false);
});

it('aborts an armed scrub and resumes without seeking when a pinch starts mid-drag (G5)', () => {
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

  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    rafCallback(0);
  });

  const seekSpy = vi.spyOn(playbackService, 'seekTo');

  // A single finger drags past the threshold before any second finger is
  // down — the controller can't yet tell this apart from a real scrub
  // (that's what the "resting finger" and pinch-groundwork tests above
  // cover), so it pauses exactly as C6 requires for a lone finger.
  fireEvent.pointerDown(phantom, { clientY: 0 });
  fireEvent.pointerMove(phantom, { clientY: 30 });
  expect(playbackService.isPlaying).toBe(false);

  // A second finger lands without the first lifting. useTimelineZoom is the
  // real (unmocked) hook here, so its own native touchstart listener flips
  // isPinchingRef — the pointer-count gate alone doesn't catch this case,
  // since the gesture was already armed by the first finger before the
  // second one ever registered as a pointer event (issue #476).
  fireEvent.touchStart(phantom, {
    touches: [
      { clientX: 0, clientY: 30 },
      { clientX: 0, clientY: 70 },
    ],
  });
  fireEvent.pointerMove(phantom, { clientY: 35 });

  // Resumed immediately (no debounce wait needed) and never seeked — a
  // pinch must not commit the scroll-derived seek an ordinary scrub would.
  expect(playbackService.isPlaying).toBe(true);
  expect(seekSpy).not.toHaveBeenCalled();
});

it('does not toggle playback via click after a tap that crossed the scrub threshold', () => {
  playbackService.play();

  const { container } = render(<Scrubber {...defaultProps} />);
  const phantom = container.querySelector('.scrubber__phantom')!;
  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  // A "tap" with a few pixels of incidental finger movement crosses the
  // scrub threshold and pauses playback — a real gesture, not misattributed
  // scroll. The browser's own click-vs-drag tolerance doesn't match
  // SCRUB_MOVEMENT_THRESHOLD_PX, so a native click can still follow; it
  // must not also toggle playback (that would restart it, reproducing the
  // G1 tap-misfire class via an 8+px tap instead of a misread scroll event).
  fireEvent.pointerDown(phantom, { clientY: 0 });
  fireEvent.pointerMove(phantom, { clientY: 20 });
  fireEvent.pointerUp(phantom);
  expect(playbackService.isPlaying).toBe(false);

  fireEvent.click(phantom);

  expect(playbackService.isPlaying).toBe(false);
});

// Spec 004, milestone 3: horizontal swipe cycles the active edit-mode
// track. These tests exercise the axis-lock (useTrackCycleGesture) through
// the real (unmocked) Scrubber, mirroring how the vertical scrub gesture is
// tested above.
it('cycles the active track on a horizontal drag in edit mode (swipe left = next-newer)', () => {
  act(() => {
    enterEditMode('track-1');
  });

  const { container } = render(
    <Scrubber {...defaultProps} tracks={twoTracks} />,
  );
  const phantom = container.querySelector('.scrubber__phantom')!;

  // Predominantly horizontal movement past the threshold, moving left.
  fireEvent.pointerDown(phantom, { clientX: 100, clientY: 0 });
  fireEvent.pointerMove(phantom, { clientX: 70, clientY: 2 });
  fireEvent.pointerUp(phantom);

  expect(getActiveEditTrackId()).toBe('track-2');
});

it('cycles back on the opposite horizontal drag (swipe right = next-older)', () => {
  act(() => {
    enterEditMode('track-2');
  });

  const { container } = render(
    <Scrubber {...defaultProps} tracks={twoTracks} />,
  );
  const phantom = container.querySelector('.scrubber__phantom')!;

  fireEvent.pointerDown(phantom, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(phantom, { clientX: 30, clientY: 2 });
  fireEvent.pointerUp(phantom);

  expect(getActiveEditTrackId()).toBe('track-1');
});

it('does not pause playback for a horizontal swipe, and does not toggle it via the trailing click, in edit mode', () => {
  act(() => {
    enterEditMode('track-1');
  });
  playbackService.play();

  const { container } = render(
    <Scrubber {...defaultProps} tracks={twoTracks} />,
  );
  const phantom = container.querySelector('.scrubber__phantom')!;

  fireEvent.pointerDown(phantom, { clientX: 100, clientY: 0 });
  fireEvent.pointerMove(phantom, { clientX: 70, clientY: 2 });
  fireEvent.pointerUp(phantom);

  // A horizontal gesture must never enter the vertical scrub's pause path.
  expect(playbackService.isPlaying).toBe(true);

  fireEvent.click(phantom);

  expect(playbackService.isPlaying).toBe(true);
});

it('still scrubs vertically in edit mode (a predominantly vertical drag is untouched)', () => {
  act(() => {
    enterEditMode('track-1');
  });
  playbackService.play();

  const { container } = render(
    <Scrubber {...defaultProps} tracks={twoTracks} />,
  );
  const phantom = container.querySelector('.scrubber__phantom')!;
  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  fireEvent.pointerDown(phantom, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(phantom, { clientX: 2, clientY: 20 });

  expect(playbackService.isPlaying).toBe(false);
  expect(getActiveEditTrackId()).toBe('track-1');
});

it('still toggles playback via a plain tap (no movement) in edit mode', () => {
  act(() => {
    enterEditMode('track-1');
  });

  const { container } = render(
    <Scrubber {...defaultProps} tracks={twoTracks} />,
  );
  const phantom = container.querySelector('.scrubber__phantom')!;

  fireEvent.pointerDown(phantom, { clientX: 0, clientY: 0 });
  fireEvent.pointerUp(phantom);
  fireEvent.click(phantom);

  expect(playbackService.isPlaying).toBe(true);
});

// Regression coverage from code review: isTrackCyclingRef intentionally
// stays true from a cycle gesture's release until the next pointerdown (so
// the trailing synthetic click is suppressed), but that must not also
// starve the geometry-resync effect — which fires from drawer/resize
// changes unrelated to any pointer activity, and previously read the same
// ref via isUserScrubbing().
it('resyncs scroll after a completed horizontal track-cycle gesture, even without an intervening pointerdown', () => {
  const restoreOffsetHeight = mockOffsetHeight(800);
  act(() => {
    enterEditMode('track-1');
  });

  const { container, rerender } = render(
    <Scrubber {...defaultProps} tracks={twoTracks} />,
  );
  const phantom = container.querySelector('.scrubber__phantom')!;
  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  fireEvent.pointerDown(phantom, { clientX: 100, clientY: 0 });
  fireEvent.pointerMove(phantom, { clientX: 70, clientY: 2 });
  fireEvent.pointerUp(phantom);
  expect(getActiveEditTrackId()).toBe('track-2');

  // Force scrollTop out of sync with transportTime (0), then trigger the
  // resync effect via an unrelated drawer-height change — no further
  // pointer event on the phantom at all.
  phantom.scrollTop = 700;
  rerender(
    <Scrubber {...defaultProps} tracks={twoTracks} drawerHeight={120} />,
  );

  // maxScrollTop = 2000 - 500 = 1500; time 0 resyncs to scrollTop 1500.
  expect(phantom.scrollTop).toBe(1500);

  restoreOffsetHeight();
});

// Regression coverage from code review: a second pointer touching down
// mid-gesture (e.g. an incidental palm brush that never becomes a real
// pinch) must not discard the first finger's already-locked horizontal
// gesture — mirrors how useScrubberScroll's own handlePointerDown never
// touches scrubStateRef on a second pointer.
it('keeps a locked horizontal cycle gesture alive when a second pointer briefly touches down mid-gesture', () => {
  act(() => {
    enterEditMode('track-1');
  });

  const { container } = render(
    <Scrubber {...defaultProps} tracks={twoTracks} />,
  );
  const phantom = container.querySelector('.scrubber__phantom')!;

  fireEvent.pointerDown(phantom, { clientX: 100, clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(phantom, { clientX: 70, clientY: 2, pointerId: 1 });

  fireEvent.pointerDown(phantom, { clientX: 200, clientY: 200, pointerId: 2 });

  fireEvent.pointerMove(phantom, { clientX: 40, clientY: 3, pointerId: 1 });
  fireEvent.pointerUp(phantom, { pointerId: 1 });

  expect(getActiveEditTrackId()).toBe('track-2');
});

it('does not permanently stick the gesture state if recording starts before a scroll event schedules the debounce', () => {
  vi.useFakeTimers();
  playbackService.play();

  const { container } = render(<Scrubber {...defaultProps} />);
  const phantom = container.querySelector('.scrubber__phantom')!;
  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  // A drag enters the gesture and pauses playback...
  fireEvent.pointerDown(phantom, { clientY: 0 });
  fireEvent.pointerMove(phantom, { clientY: 20 });
  expect(playbackService.isPlaying).toBe(false);

  // ...then recording starts and the finger lifts before any `scroll` event
  // has fired for this gesture (a fast flick can outrun the browser's own
  // scroll dispatch, and handleScroll would refuse to commit while actively
  // recording anyway). Without handlePointerEnd scheduling its own commit,
  // nothing would ever fire 'seekCommitted', leaving scrubStateRef stuck at
  // 'pendingSeek' forever.
  recordingService.arm();
  recordingService.startRecording();
  fireEvent.pointerUp(phantom);
  recordingService.stopRecording();

  act(() => {
    vi.advanceTimersByTime(PAST_SCROLL_DEBOUNCE_MS);
  });
  vi.useRealTimers();

  // A stuck gesture state would silently swallow this fresh drag — the
  // idle-only guard in handlePointerMove never lets it re-enter, so
  // playback would never pause here if the earlier gesture never unstuck.
  playbackService.play();
  fireEvent.pointerDown(phantom, { clientY: 100 });
  fireEvent.pointerMove(phantom, { clientY: 130 });

  expect(playbackService.isPlaying).toBe(false);
});

it('resumes playback after the debounced seek when nothing intervenes', () => {
  vi.useFakeTimers();
  playbackService.play();

  renderAndArmScrubResume();
  expect(playbackService.isPlaying).toBe(false);

  act(() => {
    vi.advanceTimersByTime(PAST_SCROLL_DEBOUNCE_MS);
  });

  expect(playbackService.isPlaying).toBe(true);
  vi.useRealTimers();
});

// Issue #475: an armed scrub auto-resume used to survive any explicit
// command that landed inside the debounce window, so a user who pressed
// play then pause again (or any other explicit toggle) right after a scrub
// would still get resumed a moment later by the stale armed resume.
// PlaybackService's command epoch (bumped by every explicit play/pause/
// stop/rewind/seekTo call) lets the scrub controller detect that and skip
// its own resume.
it('cancels the armed auto-resume if an explicit command intervenes before the debounce commits', () => {
  vi.useFakeTimers();
  playbackService.play();

  renderAndArmScrubResume();
  expect(playbackService.isPlaying).toBe(false);

  // The user explicitly toggles play then pause again before the ~200ms
  // debounced seek/resume commits.
  act(() => {
    playbackService.play();
    playbackService.pause();
  });
  expect(playbackService.isPlaying).toBe(false);

  act(() => {
    vi.advanceTimersByTime(PAST_SCROLL_DEBOUNCE_MS);
  });

  // Without the epoch check, the stale armed resume would call play() here
  // and override the user's explicit pause.
  expect(playbackService.isPlaying).toBe(false);
  vi.useRealTimers();
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
  const offset = container.querySelector('.scrubber__offset') as HTMLElement;

  // Mock scroll dimensions so maxScrollTop is non-zero
  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    ref.current!.syncScrollToTime(2.5);
  });

  // Inverted scroll: scrollTop = maxScrollTop - time * pixelsPerSecond
  // maxScrollTop = 2000 - 500 = 1500
  // scrollTop = 1500 - (2.5 * 200) = 1500 - 500 = 1000
  expect(phantom.scrollTop).toBe(1000);
  // The offset stage follows the phantom via a translateY — the tilt never
  // scrolls (mawimbi#459/#450), so spectrograms read the phantom instead.
  expect(offset.style.transform).toBe('translate3d(0, -1000px, 0)');
});

it('scrolls to maxScrollTop when time is zero (beginning at bottom)', () => {
  const ref = createRef<ScrubberHandle>();

  const { container } = render(<Scrubber ref={ref} {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  const offset = container.querySelector('.scrubber__offset') as HTMLElement;

  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  act(() => {
    ref.current!.syncScrollToTime(0);
  });

  // At time=0, scrollTop should be at max (beginning at bottom)
  expect(phantom.scrollTop).toBe(1500);
  expect(offset.style.transform).toBe('translate3d(0, -1500px, 0)');
});

it('syncs scroll to beginning when rewinding while paused', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;

  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

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

it('does not resync scroll to a stale transport time while a user scrub is in flight', () => {
  vi.useFakeTimers();
  const restoreOffsetHeight = mockOffsetHeight(800);

  const { container, rerender } = render(<Scrubber {...defaultProps} />);

  const phantom = container.querySelector('.scrubber__phantom')!;
  Object.defineProperty(phantom, 'scrollHeight', {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(phantom, 'clientHeight', {
    value: 500,
    configurable: true,
  });

  // A user drags the timeline: pointerdown, movement past the gesture
  // threshold, then the scroll lands at a new position while the debounced
  // seek (and thus transportTime) has not yet committed.
  phantom.scrollTop = 700;
  fireEvent.pointerDown(phantom, { clientY: 0 });
  fireEvent.pointerMove(phantom, { clientY: 20 });
  fireEvent.scroll(phantom);

  // Mid-drag, the geometry changes (e.g. the drag collapses the mobile
  // address bar and resizes the viewport → new drawer-adjusted height).
  rerender(<Scrubber {...defaultProps} drawerHeight={120} />);

  // Without the scrub guard, the geometry resync would snap scrollTop back
  // to the stale transportTime (0 → maxScrollTop 1500), yanking the
  // timeline out from under the user's finger.
  expect(phantom.scrollTop).toBe(700);

  // Once the debounced seek commits, resyncs may run again.
  act(() => {
    vi.advanceTimersByTime(PAST_SCROLL_DEBOUNCE_MS);
  });
  expect(playbackService.transportTime).toBeCloseTo((1500 - 700) / 200, 6);

  restoreOffsetHeight();
  vi.useRealTimers();
});

it('shrinks phantom scroller when drawer is open', () => {
  const drawerHeight = 280;
  const { container } = render(
    <Scrubber {...defaultProps} drawerHeight={drawerHeight} />,
  );

  const phantom = container.querySelector('.scrubber__phantom') as HTMLElement;

  expect(phantom.style.bottom).toBe(`${drawerHeight}px`);
});
