import React, { useReducer } from 'react';
import { ProjectDispatchAction } from './useProjectContext';

export type ProjectState = {
  bufferToDecode?: ArrayBuffer | null;
  nextTrackId: number;
  title: string;
  tracks: Track[];
};

export type Track = {
  audioBuffer: AudioBuffer;
  color: TrackColor;
  id: number;
  index: number;
  mute: boolean;
  solo: boolean;
  volume: number;
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
export const MOVE_TRACK = 'MOVE_TRACK';
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
    case MOVE_TRACK:
      return { ...state, tracks: moveTrack(state.tracks, payload) };
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
    audioBuffer,
    color: COLOR_PALETTE[id],
    id,
    index: id,
    mute: false,
    solo: false,
    volume: 100,
  };
}

function moveTrack(tracks: Track[], { fromIndex, toIndex }: any): Track[] {
  const updatedTracks = [...tracks];
  const [removed] = updatedTracks.splice(fromIndex, 1);
  updatedTracks.splice(toIndex, 0, removed);
  return updatedTracks.map((track, i) => ({ ...track, index: i }));
}

function setTrackVolume(tracks: Track[], { id, volume }: any): Track[] {
  return tracks.map((track) =>
    track.id === id ? { ...track, volume } : track
  );
}

function setTrackMute(tracks: Track[], { id, mute }: any): Track[] {
  return tracks.map((track) => (track.id === id ? { ...track, mute } : track));
}

function setTrackSolo(tracks: Track[], { id, solo }: any): Track[] {
  return tracks.map((track) => (track.id === id ? { ...track, solo } : track));
}

const useProjectState = (
  initialState: ProjectState
): [ProjectState, React.Dispatch<ProjectDispatchAction>] => {
  const [state, dispatch] = useReducer(projectReducer, initialState);
  return [state, dispatch];
};

export default useProjectState;
