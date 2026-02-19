import { fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import { vi } from 'vitest';
import AudioService from '../../../services/AudioService';
import { mockTrack } from '../../../testUtils';
import {
  useMutedTracks,
  usePlaybackControl,
  useSpacebarPlaybackToggle,
} from '../workstationEffects';
import { SET_MUTED_TRACKS, TOGGLE_PLAYBACK } from '../workstationReducer';

const { audioServiceMock } = vi.hoisted(() => {
  const mock = {
    startPlayback: vi.fn(),
    pausePlayback: vi.fn(),
    setTransportTime: vi.fn(),
    mixer: { getMutedChannels: vi.fn().mockReturnValue([]) },
  };
  return { audioServiceMock: mock };
});

vi.mock('../../../services/AudioService', () => ({
  default: {
    getInstance: vi.fn().mockReturnValue(audioServiceMock),
    startPlayback: audioServiceMock.startPlayback,
    pausePlayback: audioServiceMock.pausePlayback,
    setTransportTime: audioServiceMock.setTransportTime,
  },
}));

const mockDispatch = vi.fn();

it('computes muted tracks', () => {
  const tracks = [
    mockTrack({ id: 1, mute: true, solo: false }),
    mockTrack({ id: 2, mute: false, solo: true }),
    mockTrack({ id: 3, mute: true, solo: true }),
    mockTrack({ id: 4, mute: false, solo: false }),
  ];

  renderHook(() => useMutedTracks(tracks, mockDispatch));

  expect(mockDispatch).toHaveBeenLastCalledWith([SET_MUTED_TRACKS, []]);
});

it('toggles playback with spacebar', () => {
  renderHook(() => useSpacebarPlaybackToggle(mockDispatch));

  fireEvent.keyUp(window, { key: ' ', code: 'Space' });

  expect(mockDispatch).toHaveBeenLastCalledWith([TOGGLE_PLAYBACK]);
});

it('controls playback', () => {
  let isPlaying = true;
  let expectedTransportTime = 0;

  const { rerender } = renderHook(() =>
    usePlaybackControl(isPlaying, expectedTransportTime),
  );

  expect(audioServiceMock.startPlayback).toHaveBeenCalledTimes(1);
  expect(audioServiceMock.startPlayback).toHaveBeenCalledWith(
    expectedTransportTime,
  );

  isPlaying = false;
  expectedTransportTime = 300;
  rerender();

  expect(audioServiceMock.pausePlayback).toHaveBeenCalledTimes(1);
  expect(audioServiceMock.pausePlayback).toHaveBeenCalledWith(
    expectedTransportTime,
  );
});
