import React from 'react';
import useUndoReducer, {
  UndoControls,
} from '../../shared/hooks/useUndoReducer';
import {
  ProjectAction,
  projectReducer,
  ProjectState,
  reverseProjectAction,
  COLOR_PALETTE,
} from './projectPageReducer';

export function createInitialState(id: string): ProjectState {
  return {
    id,
    nextColorId: Math.floor(Math.random() * Math.floor(COLOR_PALETTE.length)),
    nextIndex: 0,
    title: 'New Project',
    tracks: [],
  };
}

const useProjectReducer = (
  initialState: ProjectState,
): [ProjectState, React.Dispatch<ProjectAction>, UndoControls] => {
  return useUndoReducer(projectReducer, initialState, reverseProjectAction);
};

export default useProjectReducer;
