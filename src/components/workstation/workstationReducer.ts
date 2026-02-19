import { TrackId } from '../project/projectPageReducer';

export type WorkstationState = {
  focusedTracks: TrackId[];
  isMixerOpen: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  mutedTracks: TrackId[];
  pixelsPerSecond: number;
  totalTime: number;
  transportTime: number;
};

export type WorkstationAction = [string, any?];

export const SET_MUTED_TRACKS = 'SET_MUTED_TRACKS';
export const SET_TRACK_FOCUS = 'SET_TRACK_FOCUS';
export const SET_TRACK_UNFOCUS = 'SET_TRACK_UNFOCUS';
export const SET_TOTAL_TIME = 'SET_TOTAL_TIME';
export const SET_TRANSPORT_TIME = 'SET_TRANSPORT_TIME';
export const STOP_AND_REWIND_PLAYBACK = 'STOP_AND_REWIND_PLAYBACK';
export const STOP_PLAYBACK = 'STOP_PLAYBACK';
export const TOGGLE_MIXER = 'TOGGLE_MIXER';
export const TOGGLE_PLAYBACK = 'TOGGLE_PLAYBACK';
export const TOGGLE_RECORDING = 'TOGGLE_RECORDING';

export function workstationReducer(
  state: WorkstationState,
  [type, payload]: WorkstationAction,
): WorkstationState {
  switch (type) {
    case SET_MUTED_TRACKS:
      return {
        ...state,
        mutedTracks: setMutedTracksOrBail(state.mutedTracks, payload),
      };
    case SET_TRACK_FOCUS:
      return {
        ...state,
        focusedTracks: setTrackFocus(state.focusedTracks, payload),
      };
    case SET_TRACK_UNFOCUS:
      return {
        ...state,
        focusedTracks: setTrackUnfocus(state.focusedTracks, payload),
      };
    case SET_TOTAL_TIME:
      return { ...state, totalTime: payload };
    case SET_TRANSPORT_TIME:
      return { ...state, transportTime: payload };
    case STOP_AND_REWIND_PLAYBACK:
      return { ...state, isPlaying: false, transportTime: 0 };
    case STOP_PLAYBACK:
      return { ...state, isPlaying: false };
    case TOGGLE_MIXER:
      return { ...state, isMixerOpen: !state.isMixerOpen };
    case TOGGLE_PLAYBACK: {
      const isEndOfPlayback =
        state.transportTime.toFixed(1) === state.totalTime.toFixed(1);
      if (isEndOfPlayback && !state.isPlaying) {
        return { ...state, isPlaying: true, transportTime: 0 };
      } else {
        return { ...state, isPlaying: !state.isPlaying };
      }
    }
    case TOGGLE_RECORDING:
      return { ...state, isRecording: !state.isRecording };
    default:
      throw new Error();
  }
}

function setMutedTracksOrBail(
  previousMutedTracks: TrackId[],
  currentMutedTracks: TrackId[],
) {
  const hasEqualLength =
    previousMutedTracks.length === currentMutedTracks.length;
  const isArrayEqual =
    hasEqualLength &&
    previousMutedTracks.every(
      (value, index) => value === currentMutedTracks[index],
    );
  return isArrayEqual ? previousMutedTracks : currentMutedTracks;
}

function setTrackFocus(focusedTracks: TrackId[], focusedTrackId: TrackId) {
  return focusedTracks.includes(focusedTrackId)
    ? focusedTracks
    : [...focusedTracks, focusedTrackId];
}

function setTrackUnfocus(focusedTracks: TrackId[], unfocusedTrackId: TrackId) {
  return focusedTracks.filter((trackId) => trackId !== unfocusedTrackId);
}
