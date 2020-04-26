import {
  SET_MUTED_TRACKS,
  WorkstationAction,
  workstationReducer,
  WorkstationState,
} from '../workstationReducer';

const defaultState: WorkstationState = {
  focusedTracks: [],
  isDrawerOpen: false,
  isPlaying: false,
  mutedTracks: [],
  pixelsPerSecond: 200,
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
