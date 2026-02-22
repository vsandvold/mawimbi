import { isInaccessible } from '@testing-library/dom';
import { act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import AudioService from '../../../services/AudioService';
import {
  isPlaying,
  resetTransportSignals,
  transportTime,
} from '../../../signals/transportSignals';
import Scrubber from '../Scrubber';

const defaultProps = {
  drawerHeight: 0,
  isMixerOpen: false,
  pixelsPerSecond: 200,
};

afterEach(() => {
  resetTransportSignals();
});

it('hides rewind button at start of playback', () => {
  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  const rewindButtonParent = rewindButton.parentNode;

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButtonParent).toHaveClass('scrubber__rewind--hidden');
});

it('shows rewind button when playback has progressed', () => {
  transportTime.value = 100;

  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  const rewindButtonParent = rewindButton.parentNode;

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButtonParent).not.toHaveClass('scrubber__rewind--hidden');
  expect(isInaccessible(rewindButton)).toEqual(false);
});

it('stops and rewinds playback when rewind button is clicked', () => {
  isPlaying.value = true;
  transportTime.value = 5.0;

  const { getByTitle } = render(<Scrubber {...defaultProps} />);

  const rewindButton = getByTitle('Rewind');
  fireEvent.click(rewindButton);

  expect(isPlaying.value).toBe(false);
  expect(transportTime.value).toBe(0);
});

it('pauses playback when timeline is scrolled while playing', () => {
  isPlaying.value = true;

  const { container } = render(<Scrubber {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.scroll(timeline);

  expect(isPlaying.value).toBe(false);
});

it('does not pause playback when timeline is scrolled while paused', () => {
  const { container } = render(<Scrubber {...defaultProps} />);

  const timeline = container.querySelector('.scrubber__timeline')!;
  fireEvent.scroll(timeline);

  expect(isPlaying.value).toBe(false);
});

it('transforms timeline vertical scale when drawer is open', () => {
  const { container } = render(
    <Scrubber {...{ ...defaultProps, drawerHeight: 120, isMixerOpen: true }} />,
  );

  const progressCursor = container.querySelector('.scrubber__cursor');
  const rewindButton = container.querySelector('.scrubber__rewind');
  const timeline = container.querySelector('.scrubber__timeline');

  expect(timeline).toBeInTheDocument();
  expect(progressCursor).toBeInTheDocument();
  expect(rewindButton).toBeInTheDocument();

  expect(timeline?.outerHTML).toEqual(
    expect.stringContaining('transform: scaleY'),
  );
  expect(progressCursor?.outerHTML).toEqual(
    expect.stringContaining('transform: scaleY'),
  );
  expect(rewindButton?.outerHTML).toEqual(
    expect.stringContaining('transform: translateY'),
  );
});

it('sets --loudness CSS variable on cursor during playback', () => {
  const audioService = AudioService.getInstance();
  const getLoudnessSpy = vi
    .spyOn(audioService.mixer, 'getLoudness')
    .mockReturnValue(0.75);

  let rafCallback: FrameRequestCallback = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb;
    return 1;
  });

  isPlaying.value = true;

  const { container } = render(<Scrubber {...defaultProps} />);

  act(() => {
    rafCallback(0);
  });

  const cursor = container.querySelector('.cursor');
  expect(getLoudnessSpy).toHaveBeenCalled();
  expect(cursor?.getAttribute('style')).toContain('--loudness: 0.75');
});

it('does not set --loudness when playback is stopped', () => {
  const audioService = AudioService.getInstance();
  const getLoudnessSpy = vi.spyOn(audioService.mixer, 'getLoudness');

  const { container } = render(<Scrubber {...defaultProps} />);

  const cursor = container.querySelector('.cursor');
  expect(getLoudnessSpy).not.toHaveBeenCalled();
  expect(cursor?.getAttribute('style')).toBeNull();
});
