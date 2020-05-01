import { renderHook } from '@testing-library/react-hooks';
import { AudioBuffer } from 'standardized-audio-context-mock';
import {
  useMutedTracks,
  useSpacebarPlaybackToggle,
  usePlaybackToggle,
  useTransportTime,
} from '../workstationEffects';
import {
  SET_MUTED_TRACKS,
  TOGGLE_PLAYBACK,
  SET_TRANSPORT_TIME,
} from '../workstationReducer';
import { fireEvent } from '@testing-library/react';
import AudioService from '../../../services/AudioService';

jest.mock('../../../services/AudioService');

const defaultState = {
  tracks: [],
};

const mockDispatch = jest.fn();

it('computes muted tracks', () => {
  const tracks = [
    createTrack({
      id: 1,
      mute: true,
      solo: false,
    }),
    createTrack({
      id: 2,
      mute: false,
      solo: true,
    }),
    createTrack({
      id: 3,
      mute: true,
      solo: true,
    }),
    createTrack({
      id: 4,
      mute: false,
      solo: false,
    }),
  ];

  renderHook(() => useMutedTracks(tracks, mockDispatch));

  expect(mockDispatch).toHaveBeenLastCalledWith([SET_MUTED_TRACKS, [1, 3, 4]]);
});

it('toggles playback with spacebar', () => {
  renderHook(() => useSpacebarPlaybackToggle(mockDispatch));

  fireEvent.keyUp(window, { key: ' ', code: 'Space' });

  expect(mockDispatch).toHaveBeenLastCalledWith([TOGGLE_PLAYBACK]);
});

it('toggles playback', () => {
  let isPlaying = false;
  const { rerender } = renderHook(() => usePlaybackToggle(isPlaying));

  expect(AudioService.pausePlayback).toHaveBeenCalledTimes(1);

  isPlaying = true;
  rerender();

  expect(AudioService.startPlayback).toHaveBeenCalledTimes(1);
});

it('sets transport time', () => {
  const expectedTransportTime = 100;

  renderHook(() => useTransportTime(expectedTransportTime));

  expect(AudioService.setTransportTime).toHaveBeenCalledWith(
    expectedTransportTime
  );
});

function createTrack(trackProps: any) {
  return {
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
    ...trackProps,
  };
}
