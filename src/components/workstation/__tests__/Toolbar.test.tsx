import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import Toolbar from '../Toolbar';
import { TOGGLE_MIXER, TOGGLE_PLAYBACK } from '../workstationReducer';

const mockDispatch = jest.fn();

jest.mock('../useWorkstationDispatch', () => {
  return () => {
    return mockDispatch;
  };
});

const defaultProps = {
  isMixerOpen: false,
  isEmpty: false,
  isPlaying: false,
  isRecording: false,
};

it('renders all buttons', () => {
  const { getAllByRole } = render(<Toolbar {...defaultProps} />);

  expect(getAllByRole('button')).toHaveLength(3);
});

it('disables buttons when tracks are empty', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: true }} />
  );

  expect(getByTitle('Show mixer')).toBeDisabled();
  expect(getByTitle('Play')).toBeDisabled();
  expect(getByTitle('Record')).not.toBeDisabled();
});

it('enables buttons when tracks are not empty', () => {
  const { getAllByRole } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: false }} />
  );

  getAllByRole('button').forEach((button) => expect(button).toBeEnabled());
});

it('renders play icon when paused', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isPlaying: false }} />
  );

  const playButton = getByTitle('Play');
  const playIcon = playButton.querySelector('[aria-label="caret-right"]');

  expect(playButton).toBeInTheDocument();
  expect(playIcon).toBeInTheDocument();
});

it('renders pause icon when playing', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isPlaying: true }} />
  );

  const pauseButton = getByTitle('Pause');
  const pauseIcon = pauseButton.querySelector('[aria-label="pause"]');

  expect(pauseButton).toBeInTheDocument();
  expect(pauseIcon).toBeInTheDocument();
});

it('renders microphone icon', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isPlaying: false }} />
  );

  const recordButton = getByTitle('Record');
  const recordIcon = recordButton.querySelector('[aria-label="audio"]');

  expect(recordButton).toBeInTheDocument();
  expect(recordIcon).toBeInTheDocument();
});

it('applies animation class to mixer icon when mixer is open', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isMixerOpen: true }} />
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

it('toggles mixer when mixer show/hide is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isMixerOpen: false }} />
  );

  const mixerButton = getByTitle('Show mixer');
  fireEvent.click(mixerButton);

  expect(mockDispatch).toBeCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith([TOGGLE_MIXER]);
});
