import { render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { TrackSignalStore } from '../../../signals/trackSignals';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Spectrogram from '../Spectrogram';

const mockGetLogarithmicFrequencyData = vi.fn().mockResolvedValue({});

vi.mock('../../../services/OfflineAnalyser', () => ({
  default: vi.fn().mockImplementation(() => ({
    frequencyBinCount: 2048,
    timeResolution: 0.025,
    getLogarithmicFrequencyData: mockGetLogarithmicFrequencyData,
  })),
}));

const { mockRetrieveAudioBuffer } = vi.hoisted(() => ({
  mockRetrieveAudioBuffer: vi.fn(),
}));

vi.mock('../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    retrieveAudioBuffer: mockRetrieveAudioBuffer,
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

it('creates OfflineAnalyser and calls getLogarithmicFrequencyData when audio buffer exists', async () => {
  const audioBuffer = { duration: 5.0 } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);

  render(<Spectrogram {...defaultProps} />);

  expect(mockGetLogarithmicFrequencyData).toHaveBeenCalledWith(
    expect.any(Function),
  );
});

it('does not call getLogarithmicFrequencyData when no audio buffer', () => {
  mockRetrieveAudioBuffer.mockReturnValue(undefined);
  mockGetLogarithmicFrequencyData.mockClear();

  render(<Spectrogram {...defaultProps} />);

  expect(mockGetLogarithmicFrequencyData).not.toHaveBeenCalled();
});

it('computes canvas dimensions from duration and time resolution', () => {
  const duration = 2.0;
  const audioBuffer = { duration } as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(audioBuffer);

  const { container } = render(<Spectrogram {...defaultProps} />);

  const canvas = container.querySelector('canvas');
  // canvasWidth = Math.trunc(duration / timeResolution) = Math.trunc(2.0 / 0.025) = 80
  expect(canvas?.getAttribute('width')).toBe('80');
});
