import {
  SET_MUTED_TRACKS,
  STOP_AND_REWIND_PLAYBACK,
  WorkstationAction,
  workstationReducer,
  WorkstationState,
} from '../workstationReducer';

const defaultState: WorkstationState = {
  focusedTracks: [],
  isMixerOpen: false,
  isPlaying: false,
  isRecording: false,
  mutedTracks: [],
  pixelsPerSecond: 200,
  totalTime: 0,
  transportTime: 0,
};

it('bails out of dispatch when muted tracks are unchanged', () => {
  const previousState = { ...defaultState, mutedTracks: [] };
  const action: WorkstationAction = [SET_MUTED_TRACKS, []];

  const currentState = workstationReducer(previousState, action);

  expect(Object.is(previousState.mutedTracks, currentState.mutedTracks)).toBe(
    true
  );
});

it('stops and rewinds playback', () => {
  const action: WorkstationAction = [STOP_AND_REWIND_PLAYBACK];

  const currentState = workstationReducer(defaultState, action);

  expect(currentState.isPlaying).toEqual(false);
  expect(currentState.transportTime).toEqual(0);
});
