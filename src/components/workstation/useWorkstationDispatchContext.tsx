import React, { useContext, createContext } from 'react';
import { WorkstationAction } from './workstationReducer';

export const WorkstationDispatch = createContext<
  React.Dispatch<WorkstationAction>
>(() => {});

const useWorkstationDispatchContext = () => {
  return useContext(WorkstationDispatch);
};

export default useWorkstationDispatchContext;
