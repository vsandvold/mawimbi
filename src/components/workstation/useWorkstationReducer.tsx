import React, { useReducer } from 'react';
import {
  WorkstationAction,
  workstationReducer,
  WorkstationState,
} from './workstationReducer';

const initialState: WorkstationState = {
  focusedTracks: [],
  isDrawerOpen: false,
  isPlaying: false,
  mutedTracks: [],
  pixelsPerSecond: 200,
  transportTime: 0,
};

const useWorkstationReducer = (): [
  WorkstationState,
  React.Dispatch<WorkstationAction>
] => {
  return useReducer(workstationReducer, initialState);
};

export default useWorkstationReducer;
