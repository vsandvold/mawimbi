import { fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  usePlaybackControl,
  useSpacebarPlaybackToggle,
} from '../workstationEffects';
import { TOGGLE_PLAYBACK } from '../workstationReducer';

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

it('does not seek when stopping and resuming without a transport time change', () => {
  // Simulates the bug: transportTime in state is set when user scrolls, but never
  // updated during playback. If the user stops and starts again, the stale scroll
  // position must not cause a jump back to where the user originally scrolled.
  let isPlaying = true;
  const transportTime = 5; // set by user scroll, stays stale during playback

  const { rerender } = renderHook(() =>
    usePlaybackControl(isPlaying, transportTime),
  );

  expect(audioServiceMock.startPlayback).toHaveBeenCalledWith(5);

  // User stops playback; transportTime in state is still the stale scroll position
  isPlaying = false;
  rerender();

  // Should pause without seeking back to the stale scroll position
  expect(audioServiceMock.pausePlayback).toHaveBeenCalledWith();

  // User starts playback again; transportTime is still stale
  isPlaying = true;
  rerender();

  // Should resume from the audio engine's current position, not the stale scroll position
  expect(audioServiceMock.startPlayback).toHaveBeenLastCalledWith();
});
