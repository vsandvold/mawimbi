import { renderHook, act } from '@testing-library/react-hooks';
import useWorkstationState, {
  WorkstationState,
  SET_MUTED_TRACKS,
} from '../useWorkstationState';

const initialState: WorkstationState = {
  focusedTracks: [],
  isDrawerOpen: false,
  isPlaying: false,
  mutedTracks: [],
  pixelsPerSecond: 200,
  transportTime: 0,
};

// TODO improve tests by returning object { state, dispatch } from hook

it('bails out of dispatch when muted tracks are unchanged', () => {
  const expectedArray: number[] = [];
  const { result } = renderHook(() =>
    useWorkstationState({ ...initialState, mutedTracks: expectedArray })
  );

  const [, dispatch] = result.current;
  act(() => {
    dispatch([SET_MUTED_TRACKS, []]);
  });

  const actualArray = result.current[0].mutedTracks;
  expect(Object.is(expectedArray, actualArray)).toBe(true);
});
