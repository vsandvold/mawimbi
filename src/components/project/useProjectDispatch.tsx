import React, { createContext, useContext } from 'react';
import { ProjectAction } from './projectReducer';

export const ProjectDispatch = createContext<React.Dispatch<ProjectAction>>(
  () => {}
);

const useProjectDispatch = () => {
  return useContext(ProjectDispatch);
};

export default useProjectDispatch;
