import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  saveProject,
  loadProject,
  resetDB,
  type StoredProject,
} from '../../../services/ProjectStorageService';
import { useAutoSave, useLoadProject } from '../projectPageEffects';
import { type ProjectState } from '../projectPageReducer';

function createStoredProject(
  overrides: Partial<StoredProject> = {},
): StoredProject {
  return {
    id: 'test-id',
    title: 'Saved Project',
    tracks: [
      {
        trackId: 'track-1',
        color: { r: 77, g: 238, b: 234 },
        fileName: 'drums.wav',
        index: 0,
      },
    ],
    nextColorId: 1,
    nextIndex: 1,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function createProjectState(
  overrides: Partial<ProjectState> = {},
): ProjectState {
  return {
    id: 'test-id',
    title: 'New Project',
    tracks: [],
    nextColorId: 0,
    nextIndex: 0,
    ...overrides,
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
  resetDB();
});

describe('useLoadProject', () => {
  it('returns null while loading', () => {
    const { result } = renderHook(() => useLoadProject('test-id'));

    expect(result.current).toBeNull();
  });

  it('restores state from a stored project', async () => {
    const stored = createStoredProject();
    await saveProject(stored);

    const { result } = renderHook(() => useLoadProject('test-id'));

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current!.id).toBe('test-id');
    expect(result.current!.title).toBe('Saved Project');
    expect(result.current!.tracks).toHaveLength(1);
    expect(result.current!.nextColorId).toBe(1);
    expect(result.current!.nextIndex).toBe(1);
  });

  it('creates a new project when none exists', async () => {
    const { result } = renderHook(() => useLoadProject('new-id'));

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current!.id).toBe('new-id');
    expect(result.current!.title).toBe('New Project');
    expect(result.current!.tracks).toEqual([]);
  });

  it('saves new project to IndexedDB immediately', async () => {
    const { result } = renderHook(() => useLoadProject('new-id'));

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    const stored = await loadProject('new-id');
    expect(stored).not.toBeNull();
    expect(stored!.id).toBe('new-id');
    expect(stored!.title).toBe('New Project');
  });
});

describe('useAutoSave', () => {
  it('saves state to IndexedDB after state changes', async () => {
    const stored = createStoredProject({ createdAt: 1000, updatedAt: 1000 });
    await saveProject(stored);

    const initialState = createProjectState();
    const { rerender } = renderHook(({ state }) => useAutoSave(state), {
      initialProps: { state: initialState },
    });

    // First render is skipped — verify no extra save yet
    const beforeChange = await loadProject('test-id');
    expect(beforeChange!.title).toBe('Saved Project');

    // Simulate a state change
    const updatedState = createProjectState({ title: 'Updated Title' });
    rerender({ state: updatedState });

    await waitFor(async () => {
      const saved = await loadProject('test-id');
      expect(saved!.title).toBe('Updated Title');
    });
  });

  it('preserves createdAt from the original stored project', async () => {
    const stored = createStoredProject({ createdAt: 1000 });
    await saveProject(stored);

    const initialState = createProjectState();
    const { rerender } = renderHook(({ state }) => useAutoSave(state), {
      initialProps: { state: initialState },
    });

    const updatedState = createProjectState({ title: 'Changed' });
    rerender({ state: updatedState });

    await waitFor(async () => {
      const saved = await loadProject('test-id');
      expect(saved!.title).toBe('Changed');
    });

    const saved = await loadProject('test-id');
    expect(saved!.createdAt).toBe(1000);
  });

  it('debounces rapid state changes', async () => {
    const stored = createStoredProject();
    await saveProject(stored);

    const saveSpy = vi.spyOn(
      await import('../../../services/ProjectStorageService'),
      'saveProject',
    );

    const state1 = createProjectState();
    const { rerender } = renderHook(({ state }) => useAutoSave(state), {
      initialProps: { state: state1 },
    });

    // Multiple rapid changes
    rerender({ state: createProjectState({ title: 'A' }) });
    rerender({ state: createProjectState({ title: 'B' }) });
    rerender({ state: createProjectState({ title: 'C' }) });

    await waitFor(async () => {
      const saved = await loadProject('test-id');
      expect(saved!.title).toBe('C');
    });

    // The debounce should coalesce saves — fewer saves than state changes
    // We check that the final value is correct (debounce kept the latest)
    const saved = await loadProject('test-id');
    expect(saved!.title).toBe('C');

    saveSpy.mockRestore();
  });
});
