import React, { useReducer } from 'react';
import { ProjectDispatchAction } from './useProjectContext';

export type ProjectState = {
  tracks: Track[];
  nextTrackId: number;
  bufferToDecode: ArrayBuffer | null;
};

export type Track = {
  id: number;
  audioBuffer: AudioBuffer;
  color: TrackColor;
  volume: number;
  mute: boolean;
  solo: boolean;
};

export type TrackColor = {
  r: number;
  g: number;
  b: number;
};

export const COLOR_PALETTE: TrackColor[] = [
  { r: 77, g: 238, b: 234 },
  { r: 116, g: 238, b: 21 },
  { r: 255, g: 231, b: 0 },
  { r: 240, g: 0, b: 255 },
  { r: 0, g: 30, b: 255 },
];

export const ADD_TRACK = 'ADD_TRACK';
export const DECODE_BUFFER = 'DECODE_BUFFER';
export const SET_TRACK_VOLUME = 'SET_TRACK_VOLUME';
export const SET_TRACK_MUTE = 'SET_TRACK_MUTE';
export const SET_TRACK_SOLO = 'SET_TRACK_SOLO';

export function projectReducer(
  state: ProjectState,
  [type, payload]: ProjectDispatchAction
): ProjectState {
  switch (type) {
    case ADD_TRACK:
      return {
        ...state,
        nextTrackId: state.nextTrackId + 1,
        tracks: [...state.tracks, createTrack(state.nextTrackId, payload)],
      };
    case DECODE_BUFFER:
      return { ...state, bufferToDecode: payload };
    case SET_TRACK_VOLUME:
      return { ...state, tracks: setTrackVolume(state.tracks, payload) };
    case SET_TRACK_MUTE:
      return { ...state, tracks: setTrackMute(state.tracks, payload) };
    case SET_TRACK_SOLO:
      return { ...state, tracks: setTrackSolo(state.tracks, payload) };
    default:
      throw new Error();
  }
}

function createTrack(id: number, audioBuffer: AudioBuffer): Track {
  return {
    id,
    audioBuffer,
    color: COLOR_PALETTE[id],
    volume: 100,
    mute: false,
    solo: false,
  };
}

function setTrackVolume(tracks: Track[], { id, volume }: any) {
  return tracks.map((track) =>
    track.id === id ? { ...track, volume } : track
  );
}

function setTrackMute(tracks: Track[], { id, mute }: any) {
  return tracks.map((track) => (track.id === id ? { ...track, mute } : track));
}

function setTrackSolo(tracks: Track[], { id, solo }: any) {
  return tracks.map((track) => (track.id === id ? { ...track, solo } : track));
}

const useProjectState = (
  initialState: ProjectState
): [ProjectState, React.Dispatch<ProjectDispatchAction>] => {
  const [state, dispatch] = useReducer(projectReducer, initialState);
  return [state, dispatch];
};

export default useProjectState;
