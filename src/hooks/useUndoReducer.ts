import { useReducer } from 'react';

const MAX_STACK_DEPTH = 50;

type UndoCommand<A> = {
  forward: A;
  reverse: A;
};

type UndoState<S, A> = {
  appState: S;
  past: UndoCommand<A>[];
  future: UndoCommand<A>[];
};

type InternalAction<A> =
  | { type: 'dispatch'; action: A }
  | { type: 'undo' }
  | { type: 'redo' };

export type UndoControls = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

function createUndoReducer<S, A>(
  reducer: (state: S, action: A) => S,
  reverseAction: (state: S, action: A) => A | null,
) {
  return (
    state: UndoState<S, A>,
    internalAction: InternalAction<A>,
  ): UndoState<S, A> => {
    switch (internalAction.type) {
      case 'dispatch': {
        const action = internalAction.action;
        const reverse = reverseAction(state.appState, action);
        const appState = reducer(state.appState, action);
        if (reverse === null) {
          return { ...state, appState };
        }
        const past = [...state.past, { forward: action, reverse }];
        if (past.length > MAX_STACK_DEPTH) {
          past.shift();
        }
        return { appState, past, future: [] };
      }
      case 'undo': {
        if (state.past.length === 0) return state;
        const command = state.past[state.past.length - 1];
        const appState = reducer(state.appState, command.reverse);
        return {
          appState,
          past: state.past.slice(0, -1),
          future: [...state.future, command],
        };
      }
      case 'redo': {
        if (state.future.length === 0) return state;
        const command = state.future[state.future.length - 1];
        const appState = reducer(state.appState, command.forward);
        return {
          appState,
          past: [...state.past, command],
          future: state.future.slice(0, -1),
        };
      }
    }
  };
}

function useUndoReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialState: S,
  reverseAction: (state: S, action: A) => A | null,
): [S, (action: A) => void, UndoControls] {
  const undoReducer = createUndoReducer(reducer, reverseAction);

  const [state, rawDispatch] = useReducer(undoReducer, {
    appState: initialState,
    past: [],
    future: [],
  });

  const dispatch = (action: A) => rawDispatch({ type: 'dispatch', action });
  const undo = () => rawDispatch({ type: 'undo' });
  const redo = () => rawDispatch({ type: 'redo' });

  return [
    state.appState,
    dispatch,
    {
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    },
  ];
}

export default useUndoReducer;
