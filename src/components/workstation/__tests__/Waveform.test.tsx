import { render } from '@testing-library/react';
import React from 'react';
import WaveSurfer from 'wavesurfer.js';
import { TrackSignalStore } from '../../../signals/trackSignals';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Waveform from '../Waveform';

const { mockRetrieveBlobUrl, MOCK_BLOB_URL } = vi.hoisted(() => {
  const url = 'blob:mock-url';
  return {
    MOCK_BLOB_URL: url,
    mockRetrieveBlobUrl: vi.fn().mockReturnValue(url),
  };
});

vi.mock('../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    retrieveBlobUrl: mockRetrieveBlobUrl,
  }),
}));

const TRACK_ID = 'track-waveform';

const defaultProps = {
  height: 128,
  pixelsPerSecond: 200,
  track: mockTrack({ trackId: TRACK_ID }),
};

beforeEach(() => {
  TrackSignalStore.create(TRACK_ID);
});

afterEach(() => {
  resetAllSignals();
});

it('renders without crashing', () => {
  render(<Waveform {...defaultProps} />);
});

it('renders waveform with correct color', () => {
  const color = { r: 234, g: 456, b: 789 };
  render(
    <Waveform
      {...{
        ...defaultProps,
        track: { ...defaultProps.track, color },
      }}
    />,
  );

  expect(WaveSurfer.create).toHaveBeenCalledTimes(1);
  expect(WaveSurfer.create).toHaveBeenCalledWith(
    expect.objectContaining({
      waveColor: `rgb(${color.r},${color.g},${color.b})`,
    }),
  );
});

it('renders with default volume opacity', () => {
  const { container } = render(<Waveform {...defaultProps} />);

  const waveform = container.firstChild;
  expect(waveform).toHaveStyle({ opacity: 1 });
});

it('renders with reduced opacity when volume signal is lower', () => {
  TrackSignalStore.get(TRACK_ID)!.volume.value = 50;

  const { container } = render(<Waveform {...defaultProps} />);

  const waveform = container.firstChild;
  expect(waveform).toHaveStyle({ opacity: 0.5 });
});

it('renders with near-zero opacity when volume signal is 1', () => {
  TrackSignalStore.get(TRACK_ID)!.volume.value = 1;

  const { container } = render(<Waveform {...defaultProps} />);

  const waveform = container.firstChild;
  expect(waveform).toHaveStyle({ opacity: 0.01 });
});

it('renders with zero opacity when volume signal is 0', () => {
  TrackSignalStore.get(TRACK_ID)!.volume.value = 0;

  const { container } = render(<Waveform {...defaultProps} />);

  const waveform = container.firstChild;
  expect(waveform).toHaveStyle({ opacity: 0 });
});

it('loads audio url when mounted', () => {
  render(<Waveform {...defaultProps} />);

  const wavesurferInstance = WaveSurfer.create({} as any);

  expect(wavesurferInstance.load).toHaveBeenCalledTimes(1);
  expect(wavesurferInstance.load).toHaveBeenCalledWith(MOCK_BLOB_URL);
});

it('destroys waveform when unmounted', () => {
  const { unmount } = render(<Waveform {...defaultProps} />);

  unmount();

  const wavesurferInstance = WaveSurfer.create({} as any);
  expect(wavesurferInstance.destroy).toHaveBeenCalledTimes(1);
});
