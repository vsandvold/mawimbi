import React, { useReducer } from 'react';
import {
  ProjectAction,
  projectReducer,
  ProjectState,
} from './projectPageReducer';

const initialState: ProjectState = {
  nextTrackId: 0,
  title: 'Untitled',
  tracks: [],
};

const useProjectReducer = (): [ProjectState, React.Dispatch<ProjectAction>] => {
  return useReducer(projectReducer, initialState);
};

export default useProjectReducer;
