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

export function projectReducer(
  state: ProjectState,
  [type, payload]: ProjectDispatchAction
): ProjectState {
  switch (type) {
    case ADD_TRACK:
      const trackId = state.nextTrackId;
      const newTrack: Track = {
        id: trackId,
        audioBuffer: payload,
        color: COLOR_PALETTE[trackId],
        volume: 100,
      };
      return {
        ...state,
        tracks: [...state.tracks, newTrack],
        nextTrackId: state.nextTrackId + 1,
      };
    case DECODE_BUFFER:
      return { ...state, bufferToDecode: payload };
    case SET_TRACK_VOLUME:
      const updatedTracks = state.tracks.map((track) =>
        track.id === payload.id ? { ...track, volume: payload.volume } : track
      );
      return { ...state, tracks: updatedTracks };
    default:
      throw new Error();
  }
}

const useProjectState = (
  initialState: ProjectState
): [ProjectState, React.Dispatch<ProjectDispatchAction>] => {
  const [state, dispatch] = useReducer(projectReducer, initialState);
  return [state, dispatch];
};

export default useProjectState;
