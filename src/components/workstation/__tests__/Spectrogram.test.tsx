import { render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useAnimationFrame } from '../../../hooks/useAnimationFrame';
import { TrackSignalStore } from '../../../signals/trackSignals';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Spectrogram from '../Spectrogram';

vi.mock('../../../hooks/useAnimationFrame', () => ({
  useAnimationFrame: vi.fn(),
}));

const mockAnalyse = vi.fn().mockResolvedValue(undefined);
const mockGetEntry = vi.fn().mockReturnValue(undefined);

const { mockRetrieveAudioBuffer } = vi.hoisted(() => ({
  mockRetrieveAudioBuffer: vi.fn(),
}));

vi.mock('../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    retrieveAudioBuffer: mockRetrieveAudioBuffer,
    spectrogramCache: {
      analyse: mockAnalyse,
      getEntry: mockGetEntry,
    },
  }),
}));

const TRACK_ID = 'track-spectrogram';

const defaultProps = {
  height: 128,
  pixelsPerSecond: 200,
  track: mockTrack({ trackId: TRACK_ID }),
};

beforeEach(() => {
  mockRetrieveAudioBuffer.mockReturnValue(undefined);
  mockAnalyse.mockClear();
  mockGetEntry.mockReturnValue(undefined);
  TrackSignalStore.create(TRACK_ID);
});

afterEach(() => {
  resetAllSignals();
});

it('renders without crashing', () => {
  render(<Spectrogram {...defaultProps} />);
});

it('renders a canvas element', () => {
  const { container } = render(<Spectrogram {...defaultProps} />);

  const canvas = container.querySelector('canvas');
  expect(canvas).toBeInTheDocument();
});

it('renders spectrogram container with correct opacity from volume signal', () => {
  TrackSignalStore.get(TRACK_ID)!.volume.value = 50;
  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ opacity: '0.50' });
});

it('renders full opacity at volume 100', () => {
  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ opacity: '1.00' });
});

it('renders zero opacity at volume 0', () => {
  TrackSignalStore.get(TRACK_ID)!.volume.value = 0;
  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ opacity: '0.00' });
});

it('triggers spectrogramCache.analyse when audio buffer exists and not cached', async () => {
  const audioBuffer = { duration: 5.0 } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);

  render(<Spectrogram {...defaultProps} />);

  await waitFor(() => {
    expect(mockAnalyse).toHaveBeenCalledWith(
      TRACK_ID,
      audioBuffer,
      defaultProps.track.color,
    );
  });
});

it('uses cached entry without re-analysis', () => {
  const audioBuffer = { duration: 5.0 } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
  const cachedEntry = {
    data: {
      frequencyFrames: [],
      timeResolution: 0.025,
      frequencyBinCount: 2048,
      sampleRate: 44100,
      duration: 5.0,
    },
    tiles: [],
  };
  mockGetEntry.mockReturnValue(cachedEntry);

  render(<Spectrogram {...defaultProps} />);

  expect(mockAnalyse).not.toHaveBeenCalled();
});

it('does not trigger analysis without audio buffer', () => {
  mockRetrieveAudioBuffer.mockReturnValue(undefined);

  render(<Spectrogram {...defaultProps} />);

  expect(mockAnalyse).not.toHaveBeenCalled();
});

it('sets container width from duration and pixelsPerSecond', () => {
  const duration = 2.5;
  const audioBuffer = { duration } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  // containerWidth = duration * pixelsPerSecond = 2.5 * 200 = 500
  expect(spectrogram).toHaveStyle({ width: '500px' });
});

it('sets container width to zero when no audio buffer', () => {
  mockRetrieveAudioBuffer.mockReturnValue(undefined);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ width: '0px' });
});

/**
 * Sets up scroll state on the scroll parent element for animation frame tests.
 * Uses scrollLeft + paddingLeft instead of getBoundingClientRect(), matching
 * the production code which avoids layout queries for sticky-positioning safety.
 */
function mockScrollState(
  scrollParent: Element,
  options: { scrollLeft: number; clientWidth: number; paddingLeft: number },
) {
  Object.defineProperty(scrollParent, 'scrollLeft', {
    value: options.scrollLeft,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(scrollParent, 'clientWidth', {
    value: options.clientWidth,
    configurable: true,
  });
  (scrollParent as HTMLElement).style.paddingLeft = `${options.paddingLeft}px`;
}

it('draws tiles at correct offset when scroll parent is scrolled', () => {
  // Capture the animation frame callback
  let animationCallback: (() => void) | undefined;
  vi.mocked(useAnimationFrame).mockImplementation((cb: () => void) => {
    animationCallback = cb;
  });

  // Set up cached entry with one tile
  const mockTile = {} as ImageBitmap;
  const totalFrames = 200;
  const cachedEntry = {
    data: {
      frequencyFrames: new Array(totalFrames).fill(new Uint8Array(2048)),
      timeResolution: 0.025,
      frequencyBinCount: 2048,
      sampleRate: 44100,
      duration: 5.0,
    },
    tiles: [mockTile],
  };
  const audioBuffer = { duration: 5.0 } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
  mockGetEntry.mockReturnValue(cachedEntry);

  // Render inside a scroll container (matches SCROLL_CONTAINER_CLASS)
  const { container } = render(
    <div className="scrubber__timeline">
      <Spectrogram {...defaultProps} />
    </div>,
  );

  const canvas = container.querySelector('canvas')!;
  const scrollParent = container.querySelector('.scrubber__timeline')!;

  // Mock canvas 2D context
  const mockCtx = { clearRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(canvas, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  );

  // Simulate scrolled state: paddingLeft = 200, scrollLeft = 500,
  // so contentOffset = 500 - 200 = 300
  const paddingLeft = 200;
  const scrollOffset = 300;

  mockScrollState(scrollParent, {
    scrollLeft: paddingLeft + scrollOffset,
    clientWidth: 400,
    paddingLeft,
  });

  // Invoke the animation callback
  expect(animationCallback).toBeDefined();
  animationCallback!();

  // drawX = tileLeftPx - contentOffset = 0 - 300 = -300
  expect(mockCtx.drawImage).toHaveBeenCalledWith(
    mockTile,
    -scrollOffset,
    0,
    expect.any(Number),
    expect.any(Number),
  );
});

it('caps content offset at container edge past the sticky boundary', () => {
  // Capture the animation frame callback
  let animationCallback: (() => void) | undefined;
  vi.mocked(useAnimationFrame).mockImplementation((cb: () => void) => {
    animationCallback = cb;
  });

  // Set up cached entry with one tile
  const mockTile = {} as ImageBitmap;
  const totalFrames = 200;
  const cachedEntry = {
    data: {
      frequencyFrames: new Array(totalFrames).fill(new Uint8Array(2048)),
      timeResolution: 0.025,
      frequencyBinCount: 2048,
      sampleRate: 44100,
      duration: 5.0,
    },
    tiles: [mockTile],
  };
  const audioBuffer = { duration: 5.0 } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
  mockGetEntry.mockReturnValue(cachedEntry);

  const { container } = render(
    <div className="scrubber__timeline">
      <Spectrogram {...defaultProps} />
    </div>,
  );

  const canvas = container.querySelector('canvas')!;
  const scrollParent = container.querySelector('.scrubber__timeline')!;

  const mockCtx = { clearRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(canvas, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  );

  // containerWidth = 5.0 * 200 = 1000, viewportWidth = 400
  // maxContentOffset = 1000 - 400 = 600
  // scrollLeft - paddingLeft = 1000 - 200 = 800, which exceeds the max.
  // Without the cap, contentOffset would be 800 and tiles would be drawn
  // beyond the spectrogram content, leaving blank regions.
  const viewportWidth = 400;
  const paddingLeft = 200;
  const rawOffset = 800;

  mockScrollState(scrollParent, {
    scrollLeft: paddingLeft + rawOffset,
    clientWidth: viewportWidth,
    paddingLeft,
  });

  expect(animationCallback).toBeDefined();
  animationCallback!();

  // contentOffset should be capped at 600 (containerWidth - viewportWidth),
  // not the raw 800. drawX = 0 - 600 = -600.
  const cappedOffset = 1000 - viewportWidth;
  expect(mockCtx.drawImage).toHaveBeenCalledWith(
    mockTile,
    -cappedOffset,
    0,
    expect.any(Number),
    expect.any(Number),
  );
});

it('redraws with updated offset when scroll position changes between frames', () => {
  let animationCallback: (() => void) | undefined;
  vi.mocked(useAnimationFrame).mockImplementation((cb: () => void) => {
    animationCallback = cb;
  });

  const mockTile = {} as ImageBitmap;
  const cachedEntry = {
    data: {
      frequencyFrames: new Array(200).fill(new Uint8Array(2048)),
      timeResolution: 0.025,
      frequencyBinCount: 2048,
      sampleRate: 44100,
      duration: 5.0,
    },
    tiles: [mockTile],
  };
  const audioBuffer = { duration: 5.0 } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
  mockGetEntry.mockReturnValue(cachedEntry);

  const { container } = render(
    <div className="scrubber__timeline">
      <Spectrogram {...defaultProps} />
    </div>,
  );

  const canvas = container.querySelector('canvas')!;
  const scrollParent = container.querySelector('.scrubber__timeline')!;

  const mockCtx = { clearRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(canvas, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  );

  const viewportWidth = 400;
  const paddingLeft = 200;

  // Frame 1: scrolled 100px into content
  mockScrollState(scrollParent, {
    scrollLeft: paddingLeft + 100,
    clientWidth: viewportWidth,
    paddingLeft,
  });

  animationCallback!();

  expect(mockCtx.drawImage).toHaveBeenLastCalledWith(
    mockTile,
    -100,
    0,
    expect.any(Number),
    expect.any(Number),
  );

  // Frame 2: user scrolls further to 400px — the spectrogram must redraw
  // at the new offset
  Object.defineProperty(scrollParent, 'scrollLeft', {
    value: paddingLeft + 400,
    configurable: true,
    writable: true,
  });

  animationCallback!();

  expect(mockCtx.drawImage).toHaveBeenLastCalledWith(
    mockTile,
    -400,
    0,
    expect.any(Number),
    expect.any(Number),
  );
});
