export type WorkstationState = {
  isMixerOpen: boolean;
  isRecording: boolean;
  pixelsPerSecond: number;
};

export type WorkstationAction = [string, any?];

export const TOGGLE_MIXER = 'TOGGLE_MIXER';
export const TOGGLE_RECORDING = 'TOGGLE_RECORDING';

export function workstationReducer(
  state: WorkstationState,
  [type]: WorkstationAction,
): WorkstationState {
  switch (type) {
    case TOGGLE_MIXER:
      return { ...state, isMixerOpen: !state.isMixerOpen };
    case TOGGLE_RECORDING:
      return { ...state, isRecording: !state.isRecording };
    default:
      throw new Error();
  }
}
