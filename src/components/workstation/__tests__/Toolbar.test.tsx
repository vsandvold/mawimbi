import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import {
  isPlaying,
  resetTransportSignals,
} from '../../../signals/transportSignals';
import Toolbar from '../Toolbar';
import { TOGGLE_MIXER } from '../workstationReducer';

const mockDispatch = vi.fn();

vi.mock('../useWorkstationDispatch', () => ({
  default: () => mockDispatch,
}));

const defaultProps = {
  isMixerOpen: false,
  isEmpty: false,
  isRecording: false,
};

afterEach(() => {
  resetTransportSignals();
});

it('renders all buttons', () => {
  const { getAllByRole } = render(<Toolbar {...defaultProps} />);

  expect(getAllByRole('button')).toHaveLength(3);
});

it('disables buttons when tracks are empty', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: true }} />,
  );

  expect(getByTitle('Show mixer')).toBeDisabled();
  expect(getByTitle('Play')).toBeDisabled();
  expect(getByTitle('Record')).not.toBeDisabled();
});

it('enables buttons when tracks are not empty', () => {
  const { getAllByRole } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: false }} />,
  );

  getAllByRole('button').forEach((button) => expect(button).toBeEnabled());
});

it('renders play icon when paused', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const playButton = getByTitle('Play');
  const playIcon = playButton.querySelector('[aria-label="caret-right"]');

  expect(playButton).toBeInTheDocument();
  expect(playIcon).toBeInTheDocument();
});

it('renders pause icon when playing', () => {
  isPlaying.value = true;

  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const pauseButton = getByTitle('Pause');
  const pauseIcon = pauseButton.querySelector('[aria-label="pause"]');

  expect(pauseButton).toBeInTheDocument();
  expect(pauseIcon).toBeInTheDocument();
});

it('renders microphone icon', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const recordButton = getByTitle('Record');
  const recordIcon = recordButton.querySelector('[aria-label="audio"]');

  expect(recordButton).toBeInTheDocument();
  expect(recordIcon).toBeInTheDocument();
});

it('applies animation class to mixer icon when mixer is open', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isMixerOpen: true }} />,
  );

  const mixerButton = getByTitle('Hide mixer');

  expect(mixerButton.querySelector('.show-mixer')).toBeInTheDocument();
});

it('toggles playback when play/pause button is clicked', () => {
  const { getByTitle } = render(<Toolbar {...defaultProps} />);

  const playButton = getByTitle('Play');
  fireEvent.click(playButton);

  expect(isPlaying.value).toBe(true);
});

it('toggles mixer when mixer show/hide is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isMixerOpen: false }} />,
  );

  const mixerButton = getByTitle('Show mixer');
  fireEvent.click(mixerButton);

  expect(mockDispatch).toBeCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith([TOGGLE_MIXER]);
});
