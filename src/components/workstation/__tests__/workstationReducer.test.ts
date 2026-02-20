import {
  SET_MUTED_TRACKS,
  SET_TOTAL_TIME,
  SET_TRACK_FOCUS,
  SET_TRACK_UNFOCUS,
  SET_TRANSPORT_TIME,
  STOP_AND_REWIND_PLAYBACK,
  STOP_PLAYBACK,
  TOGGLE_MIXER,
  TOGGLE_PLAYBACK,
  TOGGLE_RECORDING,
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
    true,
  );
});

it('updates muted tracks when they differ', () => {
  const previousState = { ...defaultState, mutedTracks: ['a'] };
  const action: WorkstationAction = [SET_MUTED_TRACKS, ['a', 'b']];

  const currentState = workstationReducer(previousState, action);

  expect(currentState.mutedTracks).toEqual(['a', 'b']);
});

it('stops and rewinds playback', () => {
  const action: WorkstationAction = [STOP_AND_REWIND_PLAYBACK];

  const currentState = workstationReducer(defaultState, action);

  expect(currentState.isPlaying).toEqual(false);
  expect(currentState.transportTime).toEqual(0);
});

describe('TOGGLE_PLAYBACK', () => {
  it('starts playback when paused', () => {
    const state = { ...defaultState, isPlaying: false };

    const result = workstationReducer(state, [TOGGLE_PLAYBACK]);

    expect(result.isPlaying).toBe(true);
  });

  it('pauses playback when playing', () => {
    const state = { ...defaultState, isPlaying: true };

    const result = workstationReducer(state, [TOGGLE_PLAYBACK]);

    expect(result.isPlaying).toBe(false);
  });

  it('restarts from beginning when at end of playback and paused', () => {
    const state = {
      ...defaultState,
      isPlaying: false,
      transportTime: 10.0,
      totalTime: 10.0,
    };

    const result = workstationReducer(state, [TOGGLE_PLAYBACK]);

    expect(result.isPlaying).toBe(true);
    expect(result.transportTime).toBe(0);
  });

  it('handles end-of-playback comparison with toFixed(1) rounding', () => {
    // 10.04.toFixed(1) === "10.0" === 10.0.toFixed(1) → treated as end of playback
    const state = {
      ...defaultState,
      isPlaying: false,
      transportTime: 10.04,
      totalTime: 10.0,
    };

    const result = workstationReducer(state, [TOGGLE_PLAYBACK]);

    expect(result.isPlaying).toBe(true);
    expect(result.transportTime).toBe(0);
  });

  it('does not restart when not quite at end of playback', () => {
    const state = {
      ...defaultState,
      isPlaying: false,
      transportTime: 9.8,
      totalTime: 10.0,
    };

    const result = workstationReducer(state, [TOGGLE_PLAYBACK]);

    expect(result.isPlaying).toBe(true);
    expect(result.transportTime).toBe(9.8);
  });
});

describe('STOP_PLAYBACK', () => {
  it('stops playback without rewinding', () => {
    const state = { ...defaultState, isPlaying: true, transportTime: 5.0 };

    const result = workstationReducer(state, [STOP_PLAYBACK]);

    expect(result.isPlaying).toBe(false);
    expect(result.transportTime).toBe(5.0);
  });
});

describe('SET_TRANSPORT_TIME', () => {
  it('updates transport time', () => {
    const result = workstationReducer(defaultState, [SET_TRANSPORT_TIME, 3.5]);

    expect(result.transportTime).toBe(3.5);
  });
});

describe('SET_TOTAL_TIME', () => {
  it('updates total time', () => {
    const result = workstationReducer(defaultState, [SET_TOTAL_TIME, 120]);

    expect(result.totalTime).toBe(120);
  });
});

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
