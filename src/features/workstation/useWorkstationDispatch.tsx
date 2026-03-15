import React, { createContext, useContext } from 'react';
import { WorkstationAction } from './workstationReducer';

export const WorkstationDispatch = createContext<
  React.Dispatch<WorkstationAction>
>(() => {});

const useWorkstationDispatch = () => {
  return useContext(WorkstationDispatch);
};

export default useWorkstationDispatch;
