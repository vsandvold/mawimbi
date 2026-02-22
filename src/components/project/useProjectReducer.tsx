import React from 'react';
import useUndoReducer, { UndoControls } from '../../hooks/useUndoReducer';
import {
  ProjectAction,
  projectReducer,
  ProjectState,
  reverseProjectAction,
  COLOR_PALETTE,
} from './projectPageReducer';

const initialState: ProjectState = {
  nextColorId: Math.floor(Math.random() * Math.floor(COLOR_PALETTE.length)),
  nextIndex: 0,
  title: 'New Project',
  tracks: [],
};

const useProjectReducer = (): [
  ProjectState,
  React.Dispatch<ProjectAction>,
  UndoControls,
] => {
  return useUndoReducer(projectReducer, initialState, reverseProjectAction);
};

export default useProjectReducer;
