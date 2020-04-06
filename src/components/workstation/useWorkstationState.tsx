import React, { useReducer } from 'react';
import { WorkstationDispatchAction } from './useWorkstationContext';

export type WorkstationState = {
  isDrawerOpen: boolean;
  isPlaying: boolean;
  pixelsPerSecond: number;
};

export const TOGGLE_DRAWER = 'TOGGLE_DRAWER';
export const TOGGLE_PLAYING = 'TOGGLE_PLAYING';

export function workstationReducer(
  state: WorkstationState,
  [type, payload]: WorkstationDispatchAction
): WorkstationState {
  switch (type) {
    case TOGGLE_DRAWER:
      console.log('toggle drawer');
      return { ...state, isDrawerOpen: !state.isDrawerOpen };
    case TOGGLE_PLAYING:
      console.log('toggle playing');
      return { ...state, isPlaying: !state.isPlaying };
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
