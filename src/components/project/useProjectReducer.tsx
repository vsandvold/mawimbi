import React, { useReducer } from 'react';
import {
  ProjectAction,
  projectReducer,
  ProjectState,
  COLOR_PALETTE,
} from './projectPageReducer';

const initialState: ProjectState = {
  nextColorId: Math.floor(Math.random() * Math.floor(COLOR_PALETTE.length)),
  nextIndex: 0,
  title: 'New Project',
  tracks: [],
};

const useProjectReducer = (): [ProjectState, React.Dispatch<ProjectAction>] => {
  return useReducer(projectReducer, initialState);
};

export default useProjectReducer;
