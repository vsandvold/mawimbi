import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import Scrubber from '../Scrubber';
import { WorkstationDispatch } from '../useWorkstationDispatch';
import { STOP_AND_REWIND_PLAYBACK } from '../workstationReducer';

const mockDispatch = jest.fn();

const defaultProps = {
  isPlaying: false,
  pixelsPerSecond: 200,
  transportTime: 0,
};

it('hides rewind button when scroll is 0', () => {
  const { getByTitle } = render(
    <Scrubber {...{ ...defaultProps, transportTime: 0 }} />
  );

  const rewindButton = getByTitle('Rewind');

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButton.parentNode).toHaveClass('scrubber__rewind--hidden');
});

it('shows rewind button when scroll is greater than 0', () => {
  const { getByTitle } = render(
    <Scrubber {...{ ...defaultProps, transportTime: 100 }} />
  );

  const rewindButton = getByTitle('Rewind');

  expect(rewindButton).toBeInTheDocument();
  expect(rewindButton.parentNode).not.toHaveClass('scrubber__rewind--hidden');
});

it('stops and rewinds playback when rewind button is clicked', () => {
  const { getByTitle } = render(
    <WorkstationDispatch.Provider value={mockDispatch}>
      <Scrubber {...defaultProps} />
    </WorkstationDispatch.Provider>
  );

  const rewindButton = getByTitle('Rewind');

  expect(rewindButton).toBeInTheDocument();
  fireEvent.click(rewindButton);

  expect(mockDispatch).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith([STOP_AND_REWIND_PLAYBACK]);
});
