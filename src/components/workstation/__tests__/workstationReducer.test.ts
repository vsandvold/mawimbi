import {
  TOGGLE_MIXER,
  TOGGLE_RECORDING,
  workstationReducer,
  WorkstationState,
} from '../workstationReducer';

const defaultState: WorkstationState = {
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

it('throws on unknown action', () => {
  expect(() => workstationReducer(defaultState, ['UNKNOWN_ACTION'])).toThrow();
});
