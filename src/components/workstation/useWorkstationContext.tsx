import React, { useContext } from 'react';

export type WorkstationDispatchAction = [string, any?];

export const WorkstationDispatch = React.createContext<
  React.Dispatch<WorkstationDispatchAction>
>(() => {});

const useWorkstationContext = () => {
  const dispatch = useContext(WorkstationDispatch);
  return [dispatch];
};

export default useWorkstationContext;
