import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useUndoReducer from '../useUndoReducer';

type State = { count: number };
type Action = [string, number?];

const INCREMENT = 'INCREMENT';
const DECREMENT = 'DECREMENT';
const SET = 'SET';
const NOOP = 'NOOP';

function reducer(state: State, [type, payload]: Action): State {
  switch (type) {
    case INCREMENT:
      return { count: state.count + 1 };
    case DECREMENT:
      return { count: state.count - 1 };
    case SET:
      return { count: payload! };
    case NOOP:
      return state;
    default:
      throw new Error();
  }
}

function reverseAction(state: State, [type]: Action): Action | null {
  switch (type) {
    case INCREMENT:
      return [DECREMENT];
    case DECREMENT:
      return [INCREMENT];
    case SET:
      return [SET, state.count];
    case NOOP:
      return null;
    default:
      return null;
  }
}

function renderUndoReducer(initialCount = 0) {
  return renderHook(() =>
    useUndoReducer(reducer, { count: initialCount }, reverseAction),
  );
}

describe('useUndoReducer', () => {
  it('returns initial state', () => {
    const { result } = renderUndoReducer();
    const [state, , controls] = result.current;

    expect(state.count).toBe(0);
    expect(controls.canUndo).toBe(false);
    expect(controls.canRedo).toBe(false);
  });

  it('dispatches actions normally', () => {
    const { result } = renderUndoReducer();

    act(() => result.current[1]([INCREMENT]));

    expect(result.current[0].count).toBe(1);
    expect(result.current[2].canUndo).toBe(true);
    expect(result.current[2].canRedo).toBe(false);
  });

  it('undoes the last action', () => {
    const { result } = renderUndoReducer();

    act(() => result.current[1]([INCREMENT]));
    act(() => result.current[2].undo());

    expect(result.current[0].count).toBe(0);
    expect(result.current[2].canUndo).toBe(false);
    expect(result.current[2].canRedo).toBe(true);
  });

  it('redoes the last undone action', () => {
    const { result } = renderUndoReducer();

    act(() => result.current[1]([INCREMENT]));
    act(() => result.current[2].undo());
    act(() => result.current[2].redo());

    expect(result.current[0].count).toBe(1);
    expect(result.current[2].canUndo).toBe(true);
    expect(result.current[2].canRedo).toBe(false);
  });

  it('undoes multiple actions in order', () => {
    const { result } = renderUndoReducer();

    act(() => result.current[1]([INCREMENT]));
    act(() => result.current[1]([INCREMENT]));
    act(() => result.current[1]([INCREMENT]));

    expect(result.current[0].count).toBe(3);

    act(() => result.current[2].undo());
    expect(result.current[0].count).toBe(2);

    act(() => result.current[2].undo());
    expect(result.current[0].count).toBe(1);

    act(() => result.current[2].undo());
    expect(result.current[0].count).toBe(0);

    expect(result.current[2].canUndo).toBe(false);
  });

  it('clears redo stack when a new action is dispatched', () => {
    const { result } = renderUndoReducer();

    act(() => result.current[1]([INCREMENT]));
    act(() => result.current[1]([INCREMENT]));
    act(() => result.current[2].undo());

    expect(result.current[2].canRedo).toBe(true);

    act(() => result.current[1]([INCREMENT]));

    expect(result.current[2].canRedo).toBe(false);
  });

  it('does nothing when undoing with empty past', () => {
    const { result } = renderUndoReducer(5);

    act(() => result.current[2].undo());

    expect(result.current[0].count).toBe(5);
  });

  it('does nothing when redoing with empty future', () => {
    const { result } = renderUndoReducer(5);

    act(() => result.current[2].redo());

    expect(result.current[0].count).toBe(5);
  });

  it('does not record actions when reverseAction returns null', () => {
    const { result } = renderUndoReducer();

    act(() => result.current[1]([NOOP]));

    expect(result.current[2].canUndo).toBe(false);
  });

  it('uses pre-mutation state for reverse action', () => {
    const { result } = renderUndoReducer();

    act(() => result.current[1]([SET, 42]));

    expect(result.current[0].count).toBe(42);

    act(() => result.current[2].undo());

    // Should restore to 0, the state before SET was applied
    expect(result.current[0].count).toBe(0);
  });
});
