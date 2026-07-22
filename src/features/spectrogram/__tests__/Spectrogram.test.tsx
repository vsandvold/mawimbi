import { render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useAnimationFrame } from '../../../shared/hooks/useAnimationFrame';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Spectrogram from '../Spectrogram';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;
const trackService = audioService.trackService;

vi.mock('../../../shared/hooks/useAnimationFrame', () => ({
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
const mockGetVisualizationData = vi.fn().mockReturnValue(new Uint8Array(774));

vi.mock('../FrequencyVisualizer', () => ({
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

vi.mock('../../project/ProjectStorageService', () => ({
  loadSpectrogramData: vi.fn().mockResolvedValue(null),
  saveSpectrogramData: vi.fn().mockResolvedValue(undefined),
  loadMelodyData: vi.fn().mockResolvedValue(null),
  saveMelodyData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../audio/useAudioService', () => ({
  useAudioService: () => ({
    spectrogramCache: {
      analyse: mockAnalyse,
      getEntry: mockGetEntry,
      restore: vi.fn(),
      getMelody: vi.fn(),
      setMelody: vi.fn(),
      extractMelodyInWorker: vi
        .fn()
        .mockResolvedValue({ notes: [], timeResolution: 0.0029 }),
    },
  }),
}));

vi.mock('../../playback/usePlaybackService', () => ({
  usePlaybackService: () => ({
    get isPlaying() {
      return playbackService.signals.isPlaying.value;
    },
    get transportTime() {
      return playbackService.signals.transportTime.value;
    },
    get playbackState() {
      return playbackService.signals.playbackState.value;
    },
    play: () => playbackService.play(),
    pause: () => playbackService.pause(),
    rewind: () => playbackService.rewind(),
    togglePlayback: () => playbackService.togglePlayback(),
    seekTo: (t: number) => playbackService.seekTo(t),
    getEngineTime: () => playbackService.getEngineTime(),
    setTransportTime: (t: number) => playbackService.setTransportTime(t),
    setLoudness: (v: number) => playbackService.setLoudness(v),
    reset: () => playbackService.reset(),
  }),
}));

vi.mock('../../recording/useRecordingService', () => ({
  useRecordingService: () => ({
    get isRecording() {
      return recordingService.signals.isRecording.value;
    },
    get isCountingIn() {
      return recordingService.signals.isCountingIn.value;
    },
    get isActivelyRecording() {
      return recordingService.isActivelyRecording();
    },
    get recordingState() {
      return recordingService.signals.recordingState.value;
    },
    arm: () => recordingService.arm(),
    startRecording: () => recordingService.startRecording(),
    stopRecording: () => recordingService.stopRecording(),
    getRecordingStartTime: () => recordingService.getRecordingStartTime(),
    isOverdubRecording: () => recordingService.isOverdubRecording(),
    getMicrophoneSource: () => recordingService.getMicrophoneSource(),
    getWorkletAnalyser: () => recordingService.getWorkletAnalyser(),
    reset: () => recordingService.reset(),
  }),
}));

vi.mock('../../tracks/useTrackService', () => ({
  useTrackService: () => ({
    retrieveAudioBuffer: mockRetrieveAudioBuffer,
    retrieveStartTime: mockRetrieveStartTime,
    getSignals: (id: string) => trackService.getSignals(id),
    get mutedTracks() {
      return trackService.signals.mutedTracks.value;
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
  mockRetrieveStartTime.mockReturnValue(0);
  mockAnalyse.mockClear();
  mockGetEntry.mockReturnValue(undefined);
  mockGetVisualizationData.mockReset().mockReturnValue(new Uint8Array(774));
  trackService.createSignals(TRACK_ID);
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

it('renders an overlay canvas for the piano roll', () => {
  const { container } = render(<Spectrogram {...defaultProps} />);

  const overlay = container.querySelector('.spectrogram__overlay');
  expect(overlay).toBeInTheDocument();
  expect(overlay?.tagName).toBe('CANVAS');
});

it('renders spectrogram container with correct opacity from volume signal', () => {
  trackService.getSignals(TRACK_ID)!.volume.value = 50;
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
  trackService.getSignals(TRACK_ID)!.volume.value = 0;
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
      '0:0:0',
      expect.any(Function),
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

it('sets container height from duration and pixelsPerSecond', () => {
  const duration = 2.5;
  const audioBuffer = { duration } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  // containerHeight = duration * pixelsPerSecond = 2.5 * 200 = 500
  expect(spectrogram).toHaveStyle({ height: '500px' });
});

it('offsets container by startTime using marginBottom for inverted timeline', () => {
  const duration = 2.5;
  const startTime = 3.0;
  const audioBuffer = { duration } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
  mockRetrieveStartTime.mockReturnValue(startTime);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  // marginBottom = startTime * pixelsPerSecond = 3.0 * 200 = 600
  // Uses marginBottom (not marginTop) because the inverted timeline has
  // beginning at the bottom — startTime offsets from the bottom.
  expect(spectrogram).toHaveStyle({ marginBottom: '600px' });
});

it('has no margin offset for tracks starting at position zero', () => {
  const duration = 2.5;
  const audioBuffer = { duration } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);
  mockRetrieveStartTime.mockReturnValue(0);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ marginBottom: '0px' });
});

it('sets container height to zero when no audio buffer', () => {
  mockRetrieveAudioBuffer.mockReturnValue(undefined);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const spectrogram = container.querySelector('.spectrogram');
  expect(spectrogram).toHaveStyle({ height: '0px' });
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
    trackService.createSignals(RECORDING_TRACK_ID);
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

  it('sets initial container height to zero in recording mode', () => {
    const { container } = render(<Spectrogram {...recordingProps} />);

    const spectrogram = container.querySelector('.spectrogram');
    expect(spectrogram).toHaveStyle({ height: '0px' });
  });

  it('offsets container by recording start time during overdub', () => {
    recordingService.arm();
    recordingService.startRecording();
    vi.spyOn(playbackService, 'getEngineTime').mockReturnValue(5.0);
    vi.spyOn(recordingService, 'isOverdubRecording').mockReturnValue(true);
    mockGetVisualizationData.mockReturnValue(new Uint8Array(774).fill(128));

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      globalCompositeOperation: 'source-over' as string,
      fillStyle: '' as string,
      canvas: { width: 800, height: 128 },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as never,
    );

    vi.spyOn(recordingService, 'getRecordingStartTime').mockReturnValue(3.0);

    const { container } = render(<Spectrogram {...recordingProps} />);

    const calls = vi.mocked(useAnimationFrame).mock.calls;
    const callback = calls[calls.length - 1]?.[0];
    callback?.();

    const spectrogram = container.querySelector('.spectrogram');
    // marginBottom = recordingStartTime * pixelsPerSecond = 3.0 * 200 = 600
    expect(spectrogram).toHaveStyle({ marginBottom: '600px' });

    vi.restoreAllMocks();
  });

  it('renders live spectrogram using engine time even when transport signal is stale', () => {
    // Simulates the first-recording bug: the Scrubber animation loop only
    // runs when playbackState is 'playing', but during the first recording
    // from position 0 playback.play() is never called (no count-in lead-in).
    // The transportTime signal stays at 0 while the transport engine is
    // actually advancing.  The spectrogram must read the engine time
    // directly so it renders regardless of the signal state.

    recordingService.arm();
    recordingService.startRecording();
    // Do NOT call playbackService.setTransportTime() — signal stays at 0
    vi.spyOn(playbackService, 'getEngineTime').mockReturnValue(2.0);
    vi.spyOn(recordingService, 'isOverdubRecording').mockReturnValue(true);
    mockGetVisualizationData.mockReturnValue(new Uint8Array(774).fill(128));

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      globalCompositeOperation: 'source-over' as string,
      fillStyle: '' as string,
      canvas: { width: 800, height: 128 },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as never,
    );

    vi.spyOn(recordingService, 'getRecordingStartTime').mockReturnValue(0);

    const { container } = render(<Spectrogram {...recordingProps} />);

    const calls = vi.mocked(useAnimationFrame).mock.calls;
    const callback = calls[calls.length - 1]?.[0];
    callback?.();

    const spectrogram = container.querySelector('.spectrogram');
    // elapsed = getEngineTime() - 0 = 2.0, height = 2.0 * 200 = 400
    expect(spectrogram).toHaveStyle({ height: '400px' });

    vi.restoreAllMocks();
  });

  it('updates container height based on elapsed recording time', () => {
    recordingService.arm();
    recordingService.startRecording();
    vi.spyOn(playbackService, 'getEngineTime').mockReturnValue(2.0);
    vi.spyOn(recordingService, 'isOverdubRecording').mockReturnValue(true);
    mockGetVisualizationData.mockReturnValue(new Uint8Array(774).fill(128));

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      globalCompositeOperation: 'source-over' as string,
      fillStyle: '' as string,
      canvas: { width: 800, height: 128 },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as never,
    );

    vi.spyOn(recordingService, 'getRecordingStartTime').mockReturnValue(0);

    const { container } = render(<Spectrogram {...recordingProps} />);

    const calls = vi.mocked(useAnimationFrame).mock.calls;
    const callback = calls[calls.length - 1]?.[0];
    callback?.();

    const spectrogram = container.querySelector('.spectrogram');
    // elapsed = 2.0 - 0 = 2.0, height = 2.0 * 200 = 400
    expect(spectrogram).toHaveStyle({ height: '400px' });

    vi.restoreAllMocks();
  });
});
