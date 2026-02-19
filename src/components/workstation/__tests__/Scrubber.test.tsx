import { isInaccessible } from '@testing-library/dom';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import Scrubber from '../Scrubber';
import { WorkstationDispatch } from '../useWorkstationDispatch';
import { STOP_AND_REWIND_PLAYBACK } from '../workstationReducer';

const mockDispatch = vi.fn();

const defaultProps = {
  drawerHeight: 0,
  isMixerOpen: false,
  isPlaying: false,
  pixelsPerSecond: 200,
  transportTime: 0,
};

it('hides rewind button at start of playback', () => {
  const { getByTitle } = render(
    <Scrubber {...{ ...defaultProps, transportTime: 0 }} />,
  );

  const rewindButton = getByTitle('Rewind');
  const rewindButtonParent = rewindButton.parentNode;

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButtonParent).toHaveClass('scrubber__rewind--hidden');
  //expect(isInaccessible(rewindButton)).toEqual(true);
});

it('shows rewind button when playback has progressed', () => {
  const { getByTitle } = render(
    <Scrubber {...{ ...defaultProps, transportTime: 100 }} />,
  );

  const rewindButton = getByTitle('Rewind');
  const rewindButtonParent = rewindButton.parentNode;

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButtonParent).not.toHaveClass('scrubber__rewind--hidden');
  expect(isInaccessible(rewindButton)).toEqual(false);
});

it('stops and rewinds playback when rewind button is clicked', () => {
  const { getByTitle } = render(
    <WorkstationDispatch.Provider value={mockDispatch}>
      <Scrubber {...defaultProps} />
    </WorkstationDispatch.Provider>,
  );

  const rewindButton = getByTitle('Rewind');
  fireEvent.click(rewindButton);

  expect(mockDispatch).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith([STOP_AND_REWIND_PLAYBACK]);
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
