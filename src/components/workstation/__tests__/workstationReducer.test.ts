import {
  SET_TRACK_FOCUS,
  SET_TRACK_UNFOCUS,
  TOGGLE_MIXER,
  TOGGLE_RECORDING,
  workstationReducer,
  WorkstationState,
} from '../workstationReducer';

const defaultState: WorkstationState = {
  focusedTracks: [],
  isMixerOpen: false,
  isRecording: false,
  pixelsPerSecond: 200,
};

describe('TOGGLE_MIXER', () => {
  it('opens mixer when closed', () => {
    const result = workstationReducer(defaultState, [TOGGLE_MIXER]);

    expect(result.isMixerOpen).toBe(true);
  });

  it('closes mixer when open', () => {
    const state = { ...defaultState, isMixerOpen: true };

    const result = workstationReducer(state, [TOGGLE_MIXER]);

    expect(result.isMixerOpen).toBe(false);
  });
});

describe('TOGGLE_RECORDING', () => {
  it('starts recording when not recording', () => {
    const result = workstationReducer(defaultState, [TOGGLE_RECORDING]);

    expect(result.isRecording).toBe(true);
  });

  it('stops recording when recording', () => {
    const state = { ...defaultState, isRecording: true };

    const result = workstationReducer(state, [TOGGLE_RECORDING]);

    expect(result.isRecording).toBe(false);
  });
});

describe('SET_TRACK_FOCUS', () => {
  it('adds track to focused list', () => {
    const result = workstationReducer(defaultState, [SET_TRACK_FOCUS, 'a']);

    expect(result.focusedTracks).toEqual(['a']);
  });

  it('does not duplicate already focused track', () => {
    const state = { ...defaultState, focusedTracks: ['a'] };

    const result = workstationReducer(state, [SET_TRACK_FOCUS, 'a']);

    expect(result.focusedTracks).toEqual(['a']);
  });
});

describe('SET_TRACK_UNFOCUS', () => {
  it('removes track from focused list', () => {
    const state = { ...defaultState, focusedTracks: ['a', 'b'] };

    const result = workstationReducer(state, [SET_TRACK_UNFOCUS, 'a']);

    expect(result.focusedTracks).toEqual(['b']);
  });
});

it('throws on unknown action', () => {
  expect(() => workstationReducer(defaultState, ['UNKNOWN_ACTION'])).toThrow();
});
