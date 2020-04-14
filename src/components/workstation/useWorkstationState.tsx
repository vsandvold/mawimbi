import React, { useReducer } from 'react';
import { WorkstationDispatchAction } from './useWorkstationContext';

export type WorkstationState = {
  focusedTracks: number[];
  isDrawerOpen: boolean;
  isPlaying: boolean;
  mutedTracks: number[];
  pixelsPerSecond: number;
  transportTime: number;
};

export const SET_MUTED_TRACKS = 'SET_MUTED_TRACKS';
export const SET_TRACK_FOCUS = 'SET_TRACK_FOCUS';
export const SET_TRACK_UNFOCUS = 'SET_TRACK_UNFOCUS';
export const SET_TRANSPORT_TIME = 'SET_TRANSPORT_TIME';
export const STOP_PLAYBACK = 'STOP_PLAYBACK';
export const TOGGLE_DRAWER = 'TOGGLE_DRAWER';
export const TOGGLE_PLAYBACK = 'TOGGLE_PLAYBACK';

export function workstationReducer(
  state: WorkstationState,
  [type, payload]: WorkstationDispatchAction
): WorkstationState {
  switch (type) {
    case SET_TRANSPORT_TIME:
      return { ...state, transportTime: payload };
    case SET_MUTED_TRACKS:
      return { ...state, mutedTracks: payload };
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
    case STOP_PLAYBACK:
      return { ...state, isPlaying: false };
    case TOGGLE_DRAWER:
      return { ...state, isDrawerOpen: !state.isDrawerOpen };
    case TOGGLE_PLAYBACK:
      return { ...state, isPlaying: !state.isPlaying };
    default:
      throw new Error();
  }
}

function setTrackFocus(focusedTracks: number[], focusedTrackId: number) {
  return focusedTracks.includes(focusedTrackId)
    ? focusedTracks
    : [...focusedTracks, focusedTrackId];
}

function setTrackUnfocus(focusedTracks: number[], unfocusedTrackId: number) {
  return focusedTracks.filter((trackId) => trackId !== unfocusedTrackId);
}

const useWorkstationState = (
  initialState: WorkstationState
): [WorkstationState, React.Dispatch<WorkstationDispatchAction>] => {
  const [state, dispatch] = useReducer(workstationReducer, initialState);
  return [state, dispatch];
};

export default useWorkstationState;
