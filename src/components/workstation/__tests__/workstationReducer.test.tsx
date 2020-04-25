import {
  SET_MUTED_TRACKS,
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
  const expectedArray: number[] = [];

  const actualState = workstationReducer(
    { ...defaultState, mutedTracks: expectedArray },
    [SET_MUTED_TRACKS, []]
  );

  expect(Object.is(expectedArray, actualState.mutedTracks)).toBe(true);
});
