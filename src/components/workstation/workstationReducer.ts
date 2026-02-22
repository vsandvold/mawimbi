import { TrackId } from '../project/projectPageReducer';

export type WorkstationState = {
  focusedTracks: TrackId[];
  isMixerOpen: boolean;
  isRecording: boolean;
  pixelsPerSecond: number;
};

export type WorkstationAction = [string, any?];

export const SET_TRACK_FOCUS = 'SET_TRACK_FOCUS';
export const SET_TRACK_UNFOCUS = 'SET_TRACK_UNFOCUS';
export const TOGGLE_MIXER = 'TOGGLE_MIXER';
export const TOGGLE_RECORDING = 'TOGGLE_RECORDING';

export function workstationReducer(
  state: WorkstationState,
  [type, payload]: WorkstationAction,
): WorkstationState {
  switch (type) {
    case SET_TRACK_FOCUS:
      return {
        ...state,
        focusedTracks: setTrackFocus(state.focusedTracks, payload),
      };
    case SET_TRACK_UNFOCUS:
      return {
        ...state,
        focusedTracks: setTrackUnfocus(state.focusedTracks, payload),
      };
    case TOGGLE_MIXER:
      return { ...state, isMixerOpen: !state.isMixerOpen };
    case TOGGLE_RECORDING:
      return { ...state, isRecording: !state.isRecording };
    default:
      throw new Error();
  }
}

function setTrackFocus(focusedTracks: TrackId[], focusedTrackId: TrackId) {
  return focusedTracks.includes(focusedTrackId)
    ? focusedTracks
    : [...focusedTracks, focusedTrackId];
}

function setTrackUnfocus(focusedTracks: TrackId[], unfocusedTrackId: TrackId) {
  return focusedTracks.filter((trackId) => trackId !== unfocusedTrackId);
}
