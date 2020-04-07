import React, { useReducer } from 'react';
import { WorkstationDispatchAction } from './useWorkstationContext';

export type WorkstationState = {
  isDrawerOpen: boolean;
  isPlaying: boolean;
  pixelsPerSecond: number;
  focusedTracks: number[];
};

export const SET_TRACK_FOCUS = 'SET_TRACK_FOCUS';
export const SET_TRACK_UNFOCUS = 'SET_TRACK_UNFOCUS';
export const TOGGLE_DRAWER = 'TOGGLE_DRAWER';
export const TOGGLE_PLAYING = 'TOGGLE_PLAYING';

export function workstationReducer(
  state: WorkstationState,
  [type, payload]: WorkstationDispatchAction
): WorkstationState {
  switch (type) {
    case SET_TRACK_FOCUS:
      const focusedTrackId = payload;
      const focusedTracksFocus = state.focusedTracks.includes(focusedTrackId)
        ? state.focusedTracks
        : [...state.focusedTracks, focusedTrackId];
      return {
        ...state,
        focusedTracks: focusedTracksFocus,
      };
    case SET_TRACK_UNFOCUS:
      const unfocusedTrackId = payload;
      const focusedTracksUnfocus = state.focusedTracks.filter(
        (trackId) => trackId !== unfocusedTrackId
      );
      return {
        ...state,
        focusedTracks: focusedTracksUnfocus,
      };
    case TOGGLE_DRAWER:
      const isDrawerOpen = !state.isDrawerOpen;
      return { ...state, isDrawerOpen };
    case TOGGLE_PLAYING:
      const isPlaying = !state.isPlaying;
      return { ...state, isPlaying };
    default:
      throw new Error();
  }
}

const useWorkstationState = (
  initialState: WorkstationState
): [WorkstationState, React.Dispatch<WorkstationDispatchAction>] => {
  const [state, dispatch] = useReducer(workstationReducer, initialState);
  return [state, dispatch];
};

export default useWorkstationState;
