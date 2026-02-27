import { render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useAnimationFrame } from '../../../../hooks/useAnimationFrame';
import {
  isPlaying,
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
const mockGetFrequencyData = vi.fn();
const mockMicGetFrequencyData = vi.fn();
const mockGetRecordingStartTime = vi.fn().mockReturnValue(0);

const { mockRetrieveAudioBuffer } = vi.hoisted(() => ({
  mockRetrieveAudioBuffer: vi.fn(),
}));

vi.mock('../../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    retrieveAudioBuffer: mockRetrieveAudioBuffer,
    spectrogramCache: {
      analyse: mockAnalyse,
      getEntry: mockGetEntry,
    },
    mixer: {
      getFrequencyData: mockGetFrequencyData,
    },
    microphone: {
      getFrequencyData: mockMicGetFrequencyData,
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
  mockAnalyse.mockClear();
  mockGetEntry.mockReturnValue(undefined);
  mockGetFrequencyData.mockReset();
  mockMicGetFrequencyData.mockReset();
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

it('sets container width to zero when no audio buffer', () => {
  mockRetrieveAudioBuffer.mockReturnValue(undefined);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ width: '0px' });
});

// Scroll-offset tile drawing tests (correct offset, max-offset capping,
// redraw on scroll change) are covered by the e2e suite in
// e2e/spectrogram-timeline.spec.ts which verifies actual rendered pixels
// across the full scroll range, including past the sticky boundary.

describe('live playback overlay', () => {
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
    canvas: { width: 800, height: 128 },
  };

  const cachedEntry = {
    data: {
      frequencyFrames: [new Uint8Array(1024)],
      timeResolution: 0.025,
      frequencyBinCount: 1024,
      sampleRate: 44100,
      duration: 5.0,
    },
    tiles: [{ close: vi.fn() }],
  };

  beforeEach(() => {
    const audioBuffer = { duration: 5.0 } as AudioBuffer;
    mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
    mockGetEntry.mockReturnValue(cachedEntry);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function invokeAnimationCallback() {
    // The component renders twice: initial (tiles empty) + re-render
    // after useEffect sets the cached entry. Get the latest callback
    // which closes over the populated tiles array.
    const calls = vi.mocked(useAnimationFrame).mock.calls;
    const callback = calls[calls.length - 1]?.[0];
    callback?.();
  }

  it('reads live frequency data from mixer during playback', () => {
    isPlaying.value = true;
    transportTime.value = 1.0;
    const fftData = new Float32Array(1024).fill(-50);
    mockGetFrequencyData.mockReturnValue(fftData);

    render(<Spectrogram {...defaultProps} />);
    invokeAnimationCallback();

    expect(mockGetFrequencyData).toHaveBeenCalledWith(TRACK_ID);
  });

  it('does not read frequency data when not playing', () => {
    isPlaying.value = false;

    render(<Spectrogram {...defaultProps} />);
    invokeAnimationCallback();

    expect(mockGetFrequencyData).not.toHaveBeenCalled();
  });

  it('draws overlay column with additive compositing during playback', () => {
    isPlaying.value = true;
    transportTime.value = 1.0;
    const fftData = new Float32Array(1024).fill(-50);
    mockGetFrequencyData.mockReturnValue(fftData);

    render(<Spectrogram {...defaultProps} />);
    invokeAnimationCallback();

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.globalCompositeOperation).toBe('lighter');
    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('skips overlay when mixer returns no frequency data', () => {
    isPlaying.value = true;
    transportTime.value = 1.0;
    mockGetFrequencyData.mockReturnValue(undefined);

    render(<Spectrogram {...defaultProps} />);
    invokeAnimationCallback();

    expect(mockGetFrequencyData).toHaveBeenCalledWith(TRACK_ID);
    // save/restore are not called when there is no frequency data
    expect(mockCtx.save).not.toHaveBeenCalled();
  });

  it('does not draw overlay column for silent frequency data', () => {
    isPlaying.value = true;
    transportTime.value = 1.0;
    // All bins at or below -80 dB map to intensity 0
    const silentData = new Float32Array(1024).fill(-100);
    mockGetFrequencyData.mockReturnValue(silentData);

    render(<Spectrogram {...defaultProps} />);
    invokeAnimationCallback();

    expect(mockCtx.save).toHaveBeenCalled();
    // No fillRect calls because all intensities are 0
    expect(mockCtx.fillRect).not.toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });
});

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

  it('reads microphone frequency data during recording', () => {
    isRecording.value = true;
    transportTime.value = 1.5;
    mockGetRecordingStartTime.mockReturnValue(0);
    const micData = new Float32Array(1024).fill(-50);
    mockMicGetFrequencyData.mockReturnValue(micData);

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

    expect(mockMicGetFrequencyData).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('does not read mixer frequency data in recording mode', () => {
    isRecording.value = true;
    transportTime.value = 1.5;
    mockGetRecordingStartTime.mockReturnValue(0);
    mockMicGetFrequencyData.mockReturnValue(new Float32Array(1024).fill(-50));

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

    expect(mockGetFrequencyData).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('updates container width based on elapsed recording time', () => {
    isRecording.value = true;
    transportTime.value = 2.0;
    mockGetRecordingStartTime.mockReturnValue(0);
    mockMicGetFrequencyData.mockReturnValue(new Float32Array(1024).fill(-50));

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
