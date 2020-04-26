import { mount, shallow } from 'enzyme';
import React from 'react';
import { AudioBuffer } from 'standardized-audio-context-mock';
import WaveSurfer from 'wavesurfer.js';
import Waveform from '../Waveform';

const defaultProps = {
  height: 128,
  pixelsPerSecond: 200,
  track: {
    audioBuffer: new AudioBuffer({ length: 10, sampleRate: 44100 }),
    color: {
      r: 255,
      g: 255,
      b: 255,
    },
    id: 0,
    index: 0,
    mute: false,
    solo: false,
    volume: 100,
  },
};

it('renders without crashing', () => {
  shallow(<Waveform {...defaultProps} />);
});

it('renders waveform with correct color', () => {
  const color = { r: 234, g: 456, b: 789 };
  mount(
    <Waveform
      {...{ ...defaultProps, track: { ...defaultProps.track, color } }}
    />
  );

  expect(WaveSurfer.create).toHaveBeenCalledTimes(1);
  expect(WaveSurfer.create).toHaveBeenCalledWith(
    expect.objectContaining({
      waveColor: `rgb(${color.r},${color.g},${color.b})`,
    })
  );
});

it('renders waveforms with correct opacity', () => {
  function setVolume(props: any, volume: number) {
    return {
      ...props,
      track: { ...defaultProps.track, volume },
    };
  }

  const wrapper = mount(<Waveform {...defaultProps} />);

  expect(wrapper.html()).toContain('opacity: 1;');

  wrapper.setProps(setVolume(defaultProps, 50));

  expect(wrapper.html()).toContain('opacity: 0.5;');

  wrapper.setProps(setVolume(defaultProps, 1));

  expect(wrapper.html()).toContain('opacity: 0.01;');

  wrapper.setProps(setVolume(defaultProps, 0));

  expect(wrapper.html()).toContain('opacity: 0;');
});

it('loads audio buffer when mounted', () => {
  const wrapper = mount(<Waveform {...defaultProps} />);

  const wavesurferInstance = WaveSurfer.create({});

  expect(wavesurferInstance.loadDecodedBuffer).toHaveBeenCalledTimes(1);
  expect(wavesurferInstance.loadDecodedBuffer).toHaveBeenCalledWith(
    defaultProps.track.audioBuffer
  );
});

it('destroys waveform when unmounted', () => {
  const wrapper = mount(<Waveform {...defaultProps} />);

  wrapper.unmount();

  const wavesurferInstance = WaveSurfer.create({});
  expect(wavesurferInstance.destroy).toHaveBeenCalledTimes(1);
});
