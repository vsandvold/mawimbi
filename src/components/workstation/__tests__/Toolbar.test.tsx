import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import Toolbar from '../Toolbar';
import { TOGGLE_DRAWER, TOGGLE_PLAYBACK } from '../workstationReducer';

const mockDispatch = jest.fn();

jest.mock('../useWorkstationDispatch', () => {
  return () => {
    return mockDispatch;
  };
});

const defaultProps = {
  isDrawerOpen: false,
  isEmpty: false,
  isPlaying: false,
};

it('renders all buttons', () => {
  const { getAllByRole } = render(<Toolbar {...defaultProps} />);

  expect(getAllByRole('button')).toHaveLength(2);
});

it('disables buttons when tracks are empty', () => {
  const { getAllByRole } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: true }} />
  );

  getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
});

it('enables buttons when tracks are not empty', () => {
  const { getAllByRole } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: false }} />
  );

  getAllByRole('button').forEach((button) => expect(button).toBeEnabled());
});

it('renders play icon when paused', () => {
  const { container, getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isPlaying: false }} />
  );

  const playButton = getByTitle('Play');
  const playIcon = container.querySelector('[aria-label="caret-right"]');

  expect(playButton).toBeInTheDocument();
  expect(playIcon).toBeInTheDocument();
});

it('renders pause icon when playing', () => {
  const { container, getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isPlaying: true }} />
  );

  const pauseButton = getByTitle('Pause');
  const pauseIcon = container.querySelector('[aria-label="pause"]');

  expect(pauseButton).toBeInTheDocument();
  expect(pauseIcon).toBeInTheDocument();
});

it('applies animation class to mixer icon when drawer is open', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isDrawerOpen: true }} />
  );

  const mixerIcon = getByTitle('Hide mixer').firstChild;

  expect(mixerIcon).toHaveClass('show-mixer');
});

it('toggles playback when play/pause button is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isPlaying: true }} />
  );

  const playPauseButton = getByTitle('Pause');
  fireEvent.click(playPauseButton);

  expect(mockDispatch).toBeCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith([TOGGLE_PLAYBACK]);
});

it('toggles drawer when mixer show/hide is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isDrawerOpen: false }} />
  );

  const mixerButton = getByTitle('Show mixer');
  fireEvent.click(mixerButton);

  expect(mockDispatch).toBeCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith([TOGGLE_DRAWER]);
});
