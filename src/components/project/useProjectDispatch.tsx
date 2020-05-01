import React, { createContext, useContext } from 'react';
import { ProjectAction } from './projectPageReducer';

export const ProjectDispatch = createContext<React.Dispatch<ProjectAction>>(
  () => {}
);

const useProjectDispatch = () => {
  return useContext(ProjectDispatch);
};

export default useProjectDispatch;
