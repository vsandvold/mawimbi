import React, { useContext } from 'react';

export type ProjectDispatchAction = [string, any?];

export const ProjectDispatch = React.createContext<
  React.Dispatch<ProjectDispatchAction>
>(() => {});

const useProjectContext = () => {
  const dispatch = useContext(ProjectDispatch);
  return [dispatch];
};

export default useProjectContext;
