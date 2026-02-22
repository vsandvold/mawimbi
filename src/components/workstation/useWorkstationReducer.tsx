import React, { useReducer } from 'react';
import {
  WorkstationAction,
  workstationReducer,
  WorkstationState,
} from './workstationReducer';

const initialState: WorkstationState = {
  focusedTracks: [],
  isMixerOpen: false,
  isRecording: false,
  pixelsPerSecond: 200,
};

const useWorkstationReducer = (): [
  WorkstationState,
  React.Dispatch<WorkstationAction>,
] => {
  return useReducer(workstationReducer, initialState);
};

export default useWorkstationReducer;
