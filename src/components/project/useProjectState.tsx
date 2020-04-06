import React, { useReducer } from 'react';

export type ProjectState = {
  isPlaying: boolean;
  pixelsPerSecond: number;
  tracks: Track[];
  isDrawerOpen: boolean;
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

export type ProjectDispatchAction = [string, any?];

export const ProjectDispatch = React.createContext<
  React.Dispatch<ProjectDispatchAction>
>(() => {});

export const ADD_TRACK = 'ADD_TRACK';
export const SET_VOLUME = 'SET_VOLUME';
export const TOGGLE_DRAWER = 'TOGGLE_DRAWER';
export const TOGGLE_PLAYING = 'TOGGLE_PLAYING';

export function projectReducer(
  state: ProjectState,
  [type, payload]: ProjectDispatchAction
): ProjectState {
  switch (type) {
    case ADD_TRACK:
      const newTrack = {
        id: payload.id,
        audioBuffer: payload.audioBuffer,
        color: COLOR_PALETTE[payload.id],
        volume: 100,
      };
      return { ...state, tracks: [...state.tracks, newTrack] };
    case SET_VOLUME:
      const updatedTracks = state.tracks.map((track) =>
        track.id === payload.id ? { ...track, volume: payload.volume } : track
      );
      return { ...state, tracks: updatedTracks };
    case TOGGLE_DRAWER:
      return { ...state, isDrawerOpen: !state.isDrawerOpen };
    case TOGGLE_PLAYING:
      return { ...state, isPlaying: !state.isPlaying };
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
