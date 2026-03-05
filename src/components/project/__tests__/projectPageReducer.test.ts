import { describe, expect, it } from 'vitest';
import {
  ADD_TRACK,
  COLOR_PALETTE,
  DELETE_TRACK,
  MOVE_TRACK,
  RENAME_PROJECT,
  ProjectAction,
  projectReducer,
  ProjectState,
  reverseProjectAction,
  Track,
} from '../projectPageReducer';

const createState = (tracks: Track[] = []): ProjectState => ({
  id: 'test-project-id',
  nextColorId: 0,
  nextIndex: tracks.length,
  title: 'Test Project',
  tracks,
});

const track1: Track = {
  trackId: 'track-1',
  color: COLOR_PALETTE[0],
  fileName: 'drums.wav',
  index: 0,
};

const track2: Track = {
  trackId: 'track-2',
  color: COLOR_PALETTE[1],
  fileName: 'bass.wav',
  index: 1,
};

const track3: Track = {
  trackId: 'track-3',
  color: COLOR_PALETTE[2],
  fileName: 'vocals.wav',
  index: 2,
};

describe('projectReducer', () => {
  describe('DELETE_TRACK', () => {
    it('removes a track by id', () => {
      const state = createState([track1, track2, track3]);

      const result = projectReducer(state, [
        DELETE_TRACK,
        { trackId: 'track-2' },
      ]);

      expect(result.tracks).toHaveLength(2);
      expect(result.tracks.map((t) => t.trackId)).toEqual([
        'track-1',
        'track-3',
      ]);
    });

    it('re-indexes remaining tracks', () => {
      const state = createState([track1, track2, track3]);

      const result = projectReducer(state, [
        DELETE_TRACK,
        { trackId: 'track-1' },
      ]);

      expect(result.tracks[0].index).toBe(0);
      expect(result.tracks[1].index).toBe(1);
    });

    it('handles deleting the last track', () => {
      const state = createState([track1]);

      const result = projectReducer(state, [
        DELETE_TRACK,
        { trackId: 'track-1' },
      ]);

      expect(result.tracks).toHaveLength(0);
    });
  });

  describe('ADD_TRACK with restore', () => {
    it('restores a track as-is', () => {
      const state = createState([track1]);

      const result = projectReducer(state, [
        ADD_TRACK,
        { trackId: track2.trackId, restore: track2 },
      ]);

      expect(result.tracks).toHaveLength(2);
      expect(result.tracks[1]).toEqual(track2);
    });

    it('does not increment nextColorId or nextIndex', () => {
      const state = createState([track1]);

      const result = projectReducer(state, [
        ADD_TRACK,
        { trackId: track2.trackId, restore: track2 },
      ]);

      expect(result.nextColorId).toBe(state.nextColorId);
      expect(result.nextIndex).toBe(state.nextIndex);
    });
  });
});

describe('reverseProjectAction', () => {
  it('reverses ADD_TRACK to DELETE_TRACK', () => {
    const state = createState([track1]);
    const action: ProjectAction = [
      ADD_TRACK,
      { trackId: 'track-1', fileName: 'drums.wav' },
    ];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([DELETE_TRACK, { trackId: 'track-1' }]);
  });

  it('reverses DELETE_TRACK to ADD_TRACK with restore', () => {
    const state = createState([track1, track2]);
    const action: ProjectAction = [DELETE_TRACK, { trackId: 'track-2' }];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([
      ADD_TRACK,
      { trackId: 'track-2', restore: track2 },
    ]);
  });

  it('returns null for DELETE_TRACK when track not found', () => {
    const state = createState([track1]);
    const action: ProjectAction = [DELETE_TRACK, { trackId: 'nonexistent' }];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toBeNull();
  });

  it('reverses MOVE_TRACK by swapping indices', () => {
    const state = createState([track1, track2, track3]);
    const action: ProjectAction = [MOVE_TRACK, { fromIndex: 0, toIndex: 2 }];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([MOVE_TRACK, { fromIndex: 2, toIndex: 0 }]);
  });

  it('returns null for RENAME_PROJECT', () => {
    const state = createState();
    const action: ProjectAction = [RENAME_PROJECT, { title: 'New Title' }];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toBeNull();
  });

  it('returns null for unknown actions', () => {
    const state = createState();
    const action = ['UNKNOWN_ACTION'] as unknown as ProjectAction;

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toBeNull();
  });
});

describe('RENAME_PROJECT', () => {
  it('updates the project title', () => {
    const state = createState([track1]);

    const result = projectReducer(state, [
      RENAME_PROJECT,
      { title: 'New Title' },
    ]);

    expect(result.title).toBe('New Title');
  });

  it('preserves tracks and other state', () => {
    const state = createState([track1, track2]);

    const result = projectReducer(state, [
      RENAME_PROJECT,
      { title: 'New Title' },
    ]);

    expect(result.tracks).toEqual(state.tracks);
    expect(result.nextColorId).toBe(state.nextColorId);
    expect(result.nextIndex).toBe(state.nextIndex);
  });
});
