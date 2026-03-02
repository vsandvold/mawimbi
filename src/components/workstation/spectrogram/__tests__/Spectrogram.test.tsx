import { render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useAnimationFrame } from '../../../../hooks/useAnimationFrame';
import {
  isRecording,
  transportTime,
} from '../../../../signals/transportSignals';
import { TrackSignalStore } from '../../../../signals/trackSignals';
import { resetAllSignals } from '../../../../signals/__tests__/testUtils';
import { mockTrack } from '../../../../testUtils';
import Spectrogram from '../Spectrogram';

vi.mock('../../../../hooks/useAnimationFrame', () => ({
  useAnimationFrame: vi.fn(),
}));

// OffscreenCanvas mock for RecordingBuffer
vi.stubGlobal(
  'OffscreenCanvas',
  class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        putImageData: vi.fn(),
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        createImageData: (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
      };
    }
  },
);

const mockAnalyse = vi.fn().mockResolvedValue(undefined);
const mockGetEntry = vi.fn().mockReturnValue(undefined);
const mockGetRecordingStartTime = vi.fn().mockReturnValue(0);
const mockGetVisualizationData = vi.fn().mockReturnValue(new Uint8Array(774));

vi.mock('../../../../services/FrequencyVisualizer', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      frequencyBinCount: 774,
      getVisualizationData: mockGetVisualizationData,
      dispose: vi.fn(),
    };
  }),
}));

const { mockRetrieveAudioBuffer, mockRetrieveStartTime } = vi.hoisted(() => ({
  mockRetrieveAudioBuffer: vi.fn(),
  mockRetrieveStartTime: vi.fn().mockReturnValue(0),
}));

vi.mock('../../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    retrieveAudioBuffer: mockRetrieveAudioBuffer,
    retrieveStartTime: mockRetrieveStartTime,
    spectrogramCache: {
      analyse: mockAnalyse,
      getEntry: mockGetEntry,
    },
    microphone: {
      source: {},
    },
    getRecordingStartTime: mockGetRecordingStartTime,
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
  mockRetrieveStartTime.mockReturnValue(0);
  mockAnalyse.mockClear();
  mockGetEntry.mockReturnValue(undefined);
  mockGetVisualizationData.mockReset().mockReturnValue(new Uint8Array(774));
  mockGetRecordingStartTime.mockReturnValue(0);
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

it('offsets container by startTime for tracks recorded at non-zero position', () => {
  const duration = 2.5;
  const startTime = 3.0;
  const audioBuffer = { duration } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
  mockRetrieveStartTime.mockReturnValue(startTime);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  // marginLeft = startTime * pixelsPerSecond = 3.0 * 200 = 600
  expect(spectrogram).toHaveStyle({ marginLeft: '600px' });
});

it('has no margin offset for tracks starting at position zero', () => {
  const duration = 2.5;
  const audioBuffer = { duration } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
  mockRetrieveStartTime.mockReturnValue(0);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ marginLeft: '0px' });
});

it('sets container width to zero when no audio buffer', () => {
  mockRetrieveAudioBuffer.mockReturnValue(undefined);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ width: '0px' });
});

describe('scroll offset for tracks with non-zero start time', () => {
  const START_TIME = 3.0;
  const DURATION = 5.0;
  const VIEWPORT_WIDTH = 800;

  const mockCtx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    globalCompositeOperation: 'source-over' as string,
    fillStyle: '' as string,
    canvas: { width: VIEWPORT_WIDTH, height: 128 },
  };

  const tileImageBitmap = { close: vi.fn(), width: 4096, height: 1024 };

  const cachedEntry = {
    data: {
      frequencyFrames: Array.from({ length: 100 }, () => new Uint8Array(1024)),
      timeResolution: 0.025,
      frequencyBinCount: 1024,
      sampleRate: 44100,
      duration: DURATION,
    },
    tiles: [tileImageBitmap],
  };

  beforeEach(() => {
    const audioBuffer = { duration: DURATION } as AudioBuffer;
    mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
    mockRetrieveStartTime.mockReturnValue(START_TIME);
    mockGetEntry.mockReturnValue(cachedEntry);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    mockCtx.drawImage.mockClear();
    mockCtx.clearRect.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setScrollPosition(container: HTMLElement, scrollLeft: number): void {
    const scrollContainer = container.querySelector('.scrubber__timeline')!;
    Object.defineProperty(scrollContainer, 'scrollLeft', {
      value: scrollLeft,
      configurable: true,
    });
    Object.defineProperty(scrollContainer, 'clientWidth', {
      value: VIEWPORT_WIDTH,
      configurable: true,
    });
  }

  function invokeAnimationCallback() {
    const calls = vi.mocked(useAnimationFrame).mock.calls;
    const callback = calls[calls.length - 1]?.[0];
    callback?.();
  }

  it('draws first tile at x=0 when viewport is aligned with track start', () => {
    const containerMarginLeft = START_TIME * defaultProps.pixelsPerSecond;

    const { container } = render(
      <div className="timeline">
        <div className="scrubber__timeline">
          <Spectrogram {...defaultProps} />
        </div>
      </div>,
    );

    setScrollPosition(container, containerMarginLeft);
    invokeAnimationCallback();

    // When scrolled exactly to the track's start position, content offset
    // should be 0, so the first tile is drawn at x=0 on the canvas.
    expect(mockCtx.drawImage).toHaveBeenCalledWith(
      tileImageBitmap,
      0,
      0,
      expect.any(Number),
      128,
    );
  });
});

// Live playback overlay (drawLiveColumn) has been removed from the
// Spectrogram component. The plasma playhead now handles per-frequency
// visualization at the playhead position.

describe('recording mode', () => {
  const RECORDING_TRACK_ID = '__recording__';
  const recordingTrack = mockTrack({
    trackId: RECORDING_TRACK_ID,
    color: { r: 77, g: 238, b: 234 },
  });

  const recordingProps = {
    height: 128,
    pixelsPerSecond: 200,
    track: recordingTrack,
    isRecordingTrack: true,
  };

  beforeEach(() => {
    TrackSignalStore.create(RECORDING_TRACK_ID);
  });

  it('renders without crashing in recording mode', () => {
    render(<Spectrogram {...recordingProps} />);
  });

  it('does not retrieve audio buffer in recording mode', () => {
    render(<Spectrogram {...recordingProps} />);

    expect(mockRetrieveAudioBuffer).not.toHaveBeenCalled();
  });

  it('does not trigger cache analysis in recording mode', () => {
    render(<Spectrogram {...recordingProps} />);

    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it('sets initial container width to zero in recording mode', () => {
    const { container } = render(<Spectrogram {...recordingProps} />);

    const spectrogram = container.querySelector('.spectrogram');
    expect(spectrogram).toHaveStyle({ width: '0px' });
  });

  it('reads visualization data from FrequencyVisualizer during recording', () => {
    isRecording.value = true;
    transportTime.value = 1.5;
    mockGetRecordingStartTime.mockReturnValue(0);
    mockGetVisualizationData.mockReturnValue(new Uint8Array(774).fill(128));

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalCompositeOperation: 'source-over' as string,
      fillStyle: '' as string,
      canvas: { width: 800, height: 128 },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    render(<Spectrogram {...recordingProps} />);

    const calls = vi.mocked(useAnimationFrame).mock.calls;
    const callback = calls[calls.length - 1]?.[0];
    callback?.();

    expect(mockGetVisualizationData).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('offsets container by recording start time during overdub', () => {
    isRecording.value = true;
    transportTime.value = 5.0;
    mockGetRecordingStartTime.mockReturnValue(3.0);
    mockGetVisualizationData.mockReturnValue(new Uint8Array(774).fill(128));

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalCompositeOperation: 'source-over' as string,
      fillStyle: '' as string,
      canvas: { width: 800, height: 128 },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    const { container } = render(<Spectrogram {...recordingProps} />);

    const calls = vi.mocked(useAnimationFrame).mock.calls;
    const callback = calls[calls.length - 1]?.[0];
    callback?.();

    const spectrogram = container.querySelector('.spectrogram');
    // marginLeft = recordingStartTime * pixelsPerSecond = 3.0 * 200 = 600
    expect(spectrogram).toHaveStyle({ marginLeft: '600px' });

    vi.restoreAllMocks();
  });

  it('updates container width based on elapsed recording time', () => {
    isRecording.value = true;
    transportTime.value = 2.0;
    mockGetRecordingStartTime.mockReturnValue(0);
    mockGetVisualizationData.mockReturnValue(new Uint8Array(774).fill(128));

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalCompositeOperation: 'source-over' as string,
      fillStyle: '' as string,
      canvas: { width: 800, height: 128 },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    const { container } = render(<Spectrogram {...recordingProps} />);

    const calls = vi.mocked(useAnimationFrame).mock.calls;
    const callback = calls[calls.length - 1]?.[0];
    callback?.();

    const spectrogram = container.querySelector('.spectrogram');
    // elapsed = 2.0 - 0 = 2.0, width = 2.0 * 200 = 400
    expect(spectrogram).toHaveStyle({ width: '400px' });

    vi.restoreAllMocks();
  });
});
