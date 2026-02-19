import { render } from '@testing-library/react';
import React from 'react';
import WaveSurfer from 'wavesurfer.js';
import { mockTrack } from '../../../testUtils';
import Waveform from '../Waveform';

const { mockRetrieveAudioBuffer } = vi.hoisted(() => ({
  mockRetrieveAudioBuffer: vi.fn(),
}));

vi.mock('../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    retrieveAudioBuffer: mockRetrieveAudioBuffer,
  }),
}));

const defaultProps = {
  height: 128,
  pixelsPerSecond: 200,
  track: mockTrack(),
};

beforeEach(() => {
  mockRetrieveAudioBuffer.mockReturnValue(
    (defaultProps.track as any).audioBuffer,
  );
});

it('renders without crashing', () => {
  render(<Waveform {...defaultProps} />);
});

it('renders waveform with correct color', () => {
  const color = { r: 234, g: 456, b: 789 };
  render(
    <Waveform
      {...{ ...defaultProps, track: { ...defaultProps.track, color } }}
    />,
  );

  expect(WaveSurfer.create).toHaveBeenCalledTimes(1);
  expect(WaveSurfer.create).toHaveBeenCalledWith(
    expect.objectContaining({
      waveColor: `rgb(${color.r},${color.g},${color.b})`,
    }),
  );
});

it('renders waveforms with correct opacity', () => {
  function setVolume(props: any, volume: number) {
    return {
      ...props,
      track: { ...defaultProps.track, volume },
    };
  }

  const { container, rerender } = render(<Waveform {...defaultProps} />);

  const waveform = container.firstChild;
  expect(waveform).toHaveStyle({ opacity: 1 });

  rerender(<Waveform {...setVolume(defaultProps, 50)} />);
  expect(waveform).toHaveStyle({ opacity: 0.5 });

  rerender(<Waveform {...setVolume(defaultProps, 1)} />);
  expect(waveform).toHaveStyle({ opacity: 0.01 });

  rerender(<Waveform {...setVolume(defaultProps, 0)} />);
  expect(waveform).toHaveStyle({ opacity: 0 });
});

it('loads audio buffer when mounted', () => {
  render(<Waveform {...defaultProps} />);

  const wavesurferInstance = WaveSurfer.create({});

  expect(wavesurferInstance.loadDecodedBuffer).toHaveBeenCalledTimes(1);
  expect(wavesurferInstance.loadDecodedBuffer).toHaveBeenCalledWith(
    (defaultProps.track as any).audioBuffer,
  );
});

it('destroys waveform when unmounted', () => {
  const { unmount } = render(<Waveform {...defaultProps} />);

  unmount();

  const wavesurferInstance = WaveSurfer.create({});
  expect(wavesurferInstance.destroy).toHaveBeenCalledTimes(1);
});
