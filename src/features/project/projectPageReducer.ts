import { DEFAULT_EFFECT_AMOUNTS, type EffectId } from '../tracks/EffectsChain';
import {
  DEFAULT_VOLUME,
  type Track,
  type TrackColor,
  type TrackId,
} from '../tracks/types';

export type { Track, TrackColor, TrackId };

export type ProjectState = {
  id: string;
  nextColorId: number;
  nextIndex: number;
  title: string;
  tracks: Track[];
};

type AddTrackPayload = {
  trackId: TrackId;
  fileName?: string;
  startTime?: number;
  restore?: Track;
};

type DeleteTrackPayload = {
  trackId: TrackId;
};

type MoveTrackPayload = {
  fromIndex: number;
  toIndex: number;
};

type SetInstrumentPayload = {
  trackId: TrackId;
  instrument: string;
};

type SetTrackEffectPayload = {
  trackId: TrackId;
  effectId: EffectId;
  amount: number;
};

type SetTrackVolumePayload = {
  trackId: TrackId;
  volume: number;
};

// One action for both fields — the mute/solo cycle (on → solo → mute → on)
// changes both in a single user gesture, and two separate dispatches would
// push two undo-stack entries for one click, needing two undos to reverse.
type SetTrackMuteSoloPayload = {
  trackId: TrackId;
  mute: boolean;
  solo: boolean;
};

type RenameProjectPayload = {
  title: string;
};

export type ProjectAction =
  | [typeof ADD_TRACK, AddTrackPayload]
  | [typeof DELETE_TRACK, DeleteTrackPayload]
  | [typeof MOVE_TRACK, MoveTrackPayload]
  | [typeof SET_INSTRUMENT, SetInstrumentPayload]
  | [typeof SET_TRACK_EFFECT, SetTrackEffectPayload]
  | [typeof SET_TRACK_VOLUME, SetTrackVolumePayload]
  | [typeof SET_TRACK_MUTE_SOLO, SetTrackMuteSoloPayload]
  | [typeof RENAME_PROJECT, RenameProjectPayload];

export const COLOR_PALETTE: TrackColor[] = [
  { r: 77, g: 238, b: 234 },
  { r: 116, g: 238, b: 21 },
  { r: 255, g: 231, b: 0 },
  { r: 240, g: 0, b: 255 },
  { r: 0, g: 30, b: 255 },
];

export const ADD_TRACK = 'ADD_TRACK';
export const DELETE_TRACK = 'DELETE_TRACK';
export const MOVE_TRACK = 'MOVE_TRACK';
export const SET_INSTRUMENT = 'SET_INSTRUMENT';
export const SET_TRACK_EFFECT = 'SET_TRACK_EFFECT';
export const SET_TRACK_VOLUME = 'SET_TRACK_VOLUME';
export const SET_TRACK_MUTE_SOLO = 'SET_TRACK_MUTE_SOLO';
export const RENAME_PROJECT = 'RENAME_PROJECT';

export function projectReducer(
  state: ProjectState,
  action: ProjectAction,
): ProjectState {
  switch (action[0]) {
    case ADD_TRACK:
      return addTrack(state, action[1]);
    case DELETE_TRACK:
      return deleteTrack(state, action[1]);
    case MOVE_TRACK:
      return { ...state, tracks: moveTrack(state.tracks, action[1]) };
    case SET_INSTRUMENT:
      return setInstrument(state, action[1]);
    case SET_TRACK_EFFECT:
      return setTrackEffect(state, action[1]);
    case SET_TRACK_VOLUME:
      return setTrackVolume(state, action[1]);
    case SET_TRACK_MUTE_SOLO:
      return setTrackMuteSolo(state, action[1]);
    case RENAME_PROJECT:
      return { ...state, title: action[1].title };
    default:
      throw new Error();
  }
}

export function reverseProjectAction(
  state: ProjectState,
  action: ProjectAction,
): ProjectAction | null {
  switch (action[0]) {
    case ADD_TRACK:
      return [DELETE_TRACK, { trackId: action[1].trackId }];
    case DELETE_TRACK: {
      const track = state.tracks.find((t) => t.trackId === action[1].trackId);
      if (!track) return null;
      return [ADD_TRACK, { trackId: track.trackId, restore: track }];
    }
    case MOVE_TRACK:
      return [
        MOVE_TRACK,
        { fromIndex: action[1].toIndex, toIndex: action[1].fromIndex },
      ];
    case SET_TRACK_EFFECT: {
      const { trackId, effectId } = action[1];
      const track = state.tracks.find((t) => t.trackId === trackId);
      if (!track) return null;
      const previousAmount = (track.effects ?? DEFAULT_EFFECT_AMOUNTS)[
        effectId
      ];
      return [SET_TRACK_EFFECT, { trackId, effectId, amount: previousAmount }];
    }
    case SET_TRACK_VOLUME: {
      const { trackId } = action[1];
      const track = state.tracks.find((t) => t.trackId === trackId);
      if (!track) return null;
      return [
        SET_TRACK_VOLUME,
        { trackId, volume: track.volume ?? DEFAULT_VOLUME },
      ];
    }
    case SET_TRACK_MUTE_SOLO: {
      const { trackId } = action[1];
      const track = state.tracks.find((t) => t.trackId === trackId);
      if (!track) return null;
      return [
        SET_TRACK_MUTE_SOLO,
        {
          trackId,
          mute: track.mute ?? false,
          solo: track.solo ?? false,
        },
      ];
    }
    case RENAME_PROJECT:
      return null;
    default:
      return null;
  }
}

function addTrack(state: ProjectState, payload: AddTrackPayload): ProjectState {
  if (payload.restore) {
    return {
      ...state,
      tracks: [...state.tracks, payload.restore],
    };
  }
  return {
    ...state,
    nextColorId: (state.nextColorId + 1) % COLOR_PALETTE.length,
    nextIndex: state.nextIndex + 1,
    tracks: [
      ...state.tracks,
      createTrack(state.nextIndex, state.nextColorId, payload),
    ],
  };
}

function deleteTrack(
  state: ProjectState,
  payload: DeleteTrackPayload,
): ProjectState {
  return {
    ...state,
    tracks: state.tracks
      .filter((t) => t.trackId !== payload.trackId)
      .map((track, i) => ({ ...track, index: i })),
  };
}

function createTrack(
  index: number,
  colorIdx: number,
  { trackId, fileName, startTime }: AddTrackPayload,
): Track {
  return {
    color: COLOR_PALETTE[colorIdx],
    fileName: fileName ?? '',
    trackId,
    index,
    startTime: startTime ?? 0,
  };
}

function setInstrument(
  state: ProjectState,
  { trackId, instrument }: SetInstrumentPayload,
): ProjectState {
  return {
    ...state,
    tracks: state.tracks.map((track) =>
      track.trackId === trackId ? { ...track, instrument } : track,
    ),
  };
}

function setTrackVolume(
  state: ProjectState,
  { trackId, volume }: SetTrackVolumePayload,
): ProjectState {
  return {
    ...state,
    tracks: state.tracks.map((track) =>
      track.trackId === trackId ? { ...track, volume } : track,
    ),
  };
}

function setTrackMuteSolo(
  state: ProjectState,
  { trackId, mute, solo }: SetTrackMuteSoloPayload,
): ProjectState {
  return {
    ...state,
    tracks: state.tracks.map((track) =>
      track.trackId === trackId ? { ...track, mute, solo } : track,
    ),
  };
}

function setTrackEffect(
  state: ProjectState,
  { trackId, effectId, amount }: SetTrackEffectPayload,
): ProjectState {
  return {
    ...state,
    tracks: state.tracks.map((track) =>
      track.trackId === trackId
        ? {
            ...track,
            effects: {
              ...(track.effects ?? DEFAULT_EFFECT_AMOUNTS),
              [effectId]: amount,
            },
          }
        : track,
    ),
  };
}

function moveTrack(
  tracks: Track[],
  { fromIndex, toIndex }: MoveTrackPayload,
): Track[] {
  const updatedTracks = [...tracks];
  const [removed] = updatedTracks.splice(fromIndex, 1);
  updatedTracks.splice(toIndex, 0, removed);
  return updatedTracks.map((track, i) => ({ ...track, index: i }));
}
