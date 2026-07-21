import { describe, expect, it } from 'vitest';
import {
  ADD_TRACK,
  COLOR_PALETTE,
  DELETE_TRACK,
  MOVE_TRACK,
  RENAME_PROJECT,
  SET_INSTRUMENT,
  SET_TRACK_EFFECT,
  SET_TRACK_VOLUME,
  SET_TRACK_MUTE_SOLO,
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

  it('reverses SET_TRACK_EFFECT to the previous amount', () => {
    const trackWithEffects: Track = {
      ...track1,
      effects: { space: 10, echo: 0, tone: 0 },
    };
    const state = createState([trackWithEffects]);
    const action: ProjectAction = [
      SET_TRACK_EFFECT,
      { trackId: 'track-1', effectId: 'space', amount: 90 },
    ];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([
      SET_TRACK_EFFECT,
      { trackId: 'track-1', effectId: 'space', amount: 10 },
    ]);
  });

  it('reverses SET_TRACK_EFFECT to bypass when the track had no prior amount', () => {
    const state = createState([track1]);
    const action: ProjectAction = [
      SET_TRACK_EFFECT,
      { trackId: 'track-1', effectId: 'echo', amount: 50 },
    ];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([
      SET_TRACK_EFFECT,
      { trackId: 'track-1', effectId: 'echo', amount: 0 },
    ]);
  });

  it('returns null for SET_TRACK_EFFECT when track not found', () => {
    const state = createState([track1]);
    const action: ProjectAction = [
      SET_TRACK_EFFECT,
      { trackId: 'nonexistent', effectId: 'space', amount: 50 },
    ];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toBeNull();
  });

  it('undo → redo round-trips through the undo reducer', () => {
    const trackWithEffects: Track = {
      ...track1,
      effects: { space: 10, echo: 0, tone: 0 },
    };
    const state = createState([trackWithEffects]);
    const action: ProjectAction = [
      SET_TRACK_EFFECT,
      { trackId: 'track-1', effectId: 'space', amount: 90 },
    ];

    const forward = projectReducer(state, action);
    expect(forward.tracks[0].effects!.space).toBe(90);

    const reverse = reverseProjectAction(state, action)!;
    const undone = projectReducer(forward, reverse);
    expect(undone.tracks[0].effects!.space).toBe(10);

    const redone = projectReducer(undone, action);
    expect(redone.tracks[0].effects!.space).toBe(90);
  });

  it('reverses SET_TRACK_VOLUME to the previous value', () => {
    const state = createState([{ ...track1, volume: 30 }]);
    const action: ProjectAction = [
      SET_TRACK_VOLUME,
      { trackId: 'track-1', volume: 80 },
    ];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([
      SET_TRACK_VOLUME,
      { trackId: 'track-1', volume: 30 },
    ]);
  });

  it('reverses SET_TRACK_VOLUME to the default when the track had no prior volume', () => {
    const state = createState([track1]);
    const action: ProjectAction = [
      SET_TRACK_VOLUME,
      { trackId: 'track-1', volume: 80 },
    ];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([
      SET_TRACK_VOLUME,
      { trackId: 'track-1', volume: 100 },
    ]);
  });

  it('returns null for SET_TRACK_VOLUME when track not found', () => {
    const state = createState([track1]);
    const action: ProjectAction = [
      SET_TRACK_VOLUME,
      { trackId: 'nonexistent', volume: 80 },
    ];

    expect(reverseProjectAction(state, action)).toBeNull();
  });

  it('reverses SET_TRACK_MUTE_SOLO to the previous values', () => {
    const state = createState([{ ...track1, mute: false, solo: true }]);
    const action: ProjectAction = [
      SET_TRACK_MUTE_SOLO,
      { trackId: 'track-1', mute: true, solo: false },
    ];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([
      SET_TRACK_MUTE_SOLO,
      { trackId: 'track-1', mute: false, solo: true },
    ]);
  });

  it('reverses SET_TRACK_MUTE_SOLO to false/false when the track had no prior state', () => {
    const state = createState([track1]);
    const action: ProjectAction = [
      SET_TRACK_MUTE_SOLO,
      { trackId: 'track-1', mute: true, solo: false },
    ];

    const reverse = reverseProjectAction(state, action);

    expect(reverse).toEqual([
      SET_TRACK_MUTE_SOLO,
      { trackId: 'track-1', mute: false, solo: false },
    ]);
  });

  it('returns null for SET_TRACK_MUTE_SOLO when track not found', () => {
    const state = createState([track1]);
    const action: ProjectAction = [
      SET_TRACK_MUTE_SOLO,
      { trackId: 'nonexistent', mute: true, solo: false },
    ];

    expect(reverseProjectAction(state, action)).toBeNull();
  });

  it('undo → redo round-trips SET_TRACK_MUTE_SOLO through the undo reducer', () => {
    const state = createState([{ ...track1, mute: false, solo: false }]);
    const action: ProjectAction = [
      SET_TRACK_MUTE_SOLO,
      { trackId: 'track-1', mute: true, solo: false },
    ];

    const forward = projectReducer(state, action);
    expect(forward.tracks[0].mute).toBe(true);

    const reverse = reverseProjectAction(state, action)!;
    const undone = projectReducer(forward, reverse);
    expect(undone.tracks[0].mute).toBe(false);
    expect(undone.tracks[0].solo).toBe(false);

    const redone = projectReducer(undone, action);
    expect(redone.tracks[0].mute).toBe(true);
  });

  // Regression test for the bug code review caught: cycling solo→mute
  // used to dispatch SET_TRACK_SOLO and SET_TRACK_MUTE separately, pushing
  // two undo-stack entries for one click — a single undo left the track at
  // mute=false/solo=false ("on") instead of back at solo=true. The
  // combined action makes one click's reverse land exactly on the
  // pre-click state in a single undo.
  it('a single undo fully reverses a solo→mute cycle click, landing back at solo (not an intermediate state)', () => {
    const state = createState([{ ...track1, mute: false, solo: true }]);
    // What useChannelControls.cycleState dispatches for the solo→mute leg.
    const action: ProjectAction = [
      SET_TRACK_MUTE_SOLO,
      { trackId: 'track-1', mute: true, solo: false },
    ];

    const forward = projectReducer(state, action);
    expect(forward.tracks[0]).toMatchObject({ mute: true, solo: false });

    const reverse = reverseProjectAction(state, action)!;
    const undone = projectReducer(forward, reverse);

    expect(undone.tracks[0]).toMatchObject({ mute: false, solo: true });
  });
});

describe('SET_INSTRUMENT', () => {
  it('sets instrument on the matching track', () => {
    const state = createState([track1, track2]);

    const result = projectReducer(state, [
      SET_INSTRUMENT,
      { trackId: 'track-1', instrument: 'vocals' },
    ]);

    expect(result.tracks[0].instrument).toBe('vocals');
    expect(result.tracks[1].instrument).toBeUndefined();
  });

  it('does not mutate other tracks', () => {
    const state = createState([track1, track2, track3]);

    const result = projectReducer(state, [
      SET_INSTRUMENT,
      { trackId: 'track-2', instrument: 'drums' },
    ]);

    expect(result.tracks[1].instrument).toBe('drums');
    expect(result.tracks[0]).toEqual(track1);
    expect(result.tracks[2]).toEqual(track3);
  });
});

describe('SET_TRACK_EFFECT', () => {
  it('sets the effect amount on the matching track', () => {
    const state = createState([track1, track2]);

    const result = projectReducer(state, [
      SET_TRACK_EFFECT,
      { trackId: 'track-1', effectId: 'space', amount: 40 },
    ]);

    expect(result.tracks[0].effects).toEqual({ space: 40, echo: 0, tone: 0 });
    expect(result.tracks[1].effects).toBeUndefined();
  });

  it('preserves other effect amounts on the same track', () => {
    const trackWithEffects: Track = {
      ...track1,
      effects: { space: 10, echo: 20, tone: 30 },
    };
    const state = createState([trackWithEffects]);

    const result = projectReducer(state, [
      SET_TRACK_EFFECT,
      { trackId: 'track-1', effectId: 'echo', amount: 99 },
    ]);

    expect(result.tracks[0].effects).toEqual({
      space: 10,
      echo: 99,
      tone: 30,
    });
  });

  it('does not mutate other tracks', () => {
    const state = createState([track1, track2, track3]);

    const result = projectReducer(state, [
      SET_TRACK_EFFECT,
      { trackId: 'track-2', effectId: 'tone', amount: 50 },
    ]);

    expect(result.tracks[0]).toEqual(track1);
    expect(result.tracks[2]).toEqual(track3);
  });
});

describe('SET_TRACK_VOLUME', () => {
  it('sets the volume on the matching track', () => {
    const state = createState([track1, track2]);

    const result = projectReducer(state, [
      SET_TRACK_VOLUME,
      { trackId: 'track-1', volume: 42 },
    ]);

    expect(result.tracks[0].volume).toBe(42);
    expect(result.tracks[1].volume).toBeUndefined();
  });

  it('does not mutate other tracks', () => {
    const state = createState([track1, track2, track3]);

    const result = projectReducer(state, [
      SET_TRACK_VOLUME,
      { trackId: 'track-2', volume: 42 },
    ]);

    expect(result.tracks[0]).toEqual(track1);
    expect(result.tracks[2]).toEqual(track3);
  });
});

describe('SET_TRACK_MUTE_SOLO', () => {
  it('sets both mute and solo on the matching track', () => {
    const state = createState([track1, track2]);

    const result = projectReducer(state, [
      SET_TRACK_MUTE_SOLO,
      { trackId: 'track-1', mute: true, solo: false },
    ]);

    expect(result.tracks[0].mute).toBe(true);
    expect(result.tracks[0].solo).toBe(false);
    expect(result.tracks[1].mute).toBeUndefined();
    expect(result.tracks[1].solo).toBeUndefined();
  });

  it('does not mutate other tracks', () => {
    const state = createState([track1, track2, track3]);

    const result = projectReducer(state, [
      SET_TRACK_MUTE_SOLO,
      { trackId: 'track-2', mute: false, solo: true },
    ]);

    expect(result.tracks[0]).toEqual(track1);
    expect(result.tracks[2]).toEqual(track3);
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
