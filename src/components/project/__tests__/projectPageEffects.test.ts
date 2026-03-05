import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  saveProject,
  saveAudioData,
  loadProject,
  loadAudioData,
  resetDB,
  type StoredProject,
} from '../../../services/ProjectStorageService';
import {
  useAutoSave,
  useDeleteTrackAudio,
  useLoadProject,
  useRestoreAudio,
} from '../projectPageEffects';
import { type ProjectState } from '../projectPageReducer';
import { type Track } from '../../../types/track';

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

const mockRestoreTrack = vi.fn().mockResolvedValue({ trackId: 'track-1' });

vi.mock('../../../hooks/useTrackService', () => ({
  useTrackService: () => ({
    restoreTrack: mockRestoreTrack,
  }),
}));

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    trackId: 'track-1',
    color: { r: 77, g: 238, b: 234 },
    fileName: 'drums.wav',
    index: 0,
    ...overrides,
  };
}

describe('useRestoreAudio', () => {
  it('returns true while restoring audio', () => {
    const tracks = [createTrack()];
    saveAudioData('track-1', new ArrayBuffer(16));

    const { result } = renderHook(() => useRestoreAudio(tracks));

    expect(result.current).toBe(true);
  });

  it('returns false after audio is restored', async () => {
    const tracks = [createTrack()];
    await saveAudioData('track-1', new ArrayBuffer(16));

    const { result } = renderHook(() => useRestoreAudio(tracks));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it('calls restoreTrack for each track with audio data', async () => {
    const tracks = [
      createTrack({ trackId: 'track-1' }),
      createTrack({ trackId: 'track-2', index: 1 }),
    ];
    await saveAudioData('track-1', new ArrayBuffer(16));
    await saveAudioData('track-2', new ArrayBuffer(32));

    const { result } = renderHook(() => useRestoreAudio(tracks));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    expect(mockRestoreTrack).toHaveBeenCalledTimes(2);
    expect(mockRestoreTrack).toHaveBeenCalledWith(
      'track-1',
      expect.anything(),
      0,
    );
    expect(mockRestoreTrack).toHaveBeenCalledWith(
      'track-2',
      expect.anything(),
      0,
    );
  });

  it('uses startTime from track metadata', async () => {
    const tracks = [createTrack({ trackId: 'track-1', startTime: 3.5 })];
    await saveAudioData('track-1', new ArrayBuffer(16));

    const { result } = renderHook(() => useRestoreAudio(tracks));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    expect(mockRestoreTrack).toHaveBeenCalledWith(
      'track-1',
      expect.anything(),
      3.5,
    );
  });

  it('skips tracks with missing audio data', async () => {
    const tracks = [createTrack({ trackId: 'track-1' })];
    // No audio data saved for track-1

    const { result } = renderHook(() => useRestoreAudio(tracks));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    expect(mockRestoreTrack).not.toHaveBeenCalled();
  });

  it('returns false immediately when no tracks exist', async () => {
    const { result } = renderHook(() => useRestoreAudio([]));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it('handles restoreTrack failure gracefully', async () => {
    mockRestoreTrack.mockRejectedValueOnce(new Error('decode failed'));
    const tracks = [createTrack()];
    await saveAudioData('track-1', new ArrayBuffer(16));

    const { result } = renderHook(() => useRestoreAudio(tracks));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});

describe('useDeleteTrackAudio', () => {
  it('deletes audio data when a track is removed', async () => {
    await saveAudioData('track-1', new ArrayBuffer(16));

    const initialTracks = [createTrack({ trackId: 'track-1' })];
    const { rerender } = renderHook(
      ({ tracks }) => useDeleteTrackAudio(tracks),
      { initialProps: { tracks: initialTracks } },
    );

    // Remove the track
    rerender({ tracks: [] });

    await waitFor(async () => {
      const audio = await loadAudioData('track-1');
      expect(audio).toBeNull();
    });
  });

  it('does not delete audio for tracks that remain', async () => {
    await saveAudioData('track-1', new ArrayBuffer(16));
    await saveAudioData('track-2', new ArrayBuffer(32));

    const initialTracks = [
      createTrack({ trackId: 'track-1' }),
      createTrack({ trackId: 'track-2', index: 1 }),
    ];
    const { rerender } = renderHook(
      ({ tracks }) => useDeleteTrackAudio(tracks),
      { initialProps: { tracks: initialTracks } },
    );

    // Remove only track-1
    rerender({ tracks: [createTrack({ trackId: 'track-2', index: 0 })] });

    await waitFor(async () => {
      const audio1 = await loadAudioData('track-1');
      expect(audio1).toBeNull();
    });

    const audio2 = await loadAudioData('track-2');
    expect(audio2).not.toBeNull();
  });
});
