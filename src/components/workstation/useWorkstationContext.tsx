import React, { useContext, createContext } from 'react';
import { WorkstationAction } from './workstationReducer';

export const WorkstationDispatch = createContext<
  React.Dispatch<WorkstationAction>
>(() => {});

// export const WorkstationDispatchProvider = (props: any) => {
//   return (
//     <WorkstationDispatch.Provider value={dispatch}>
//       {props.children}
//     </WorkstationDispatch.Provider>
//   );
// };

const useWorkstationContext = () => {
  const dispatch = useContext(WorkstationDispatch);
  return [dispatch];
};

export default useWorkstationContext;
