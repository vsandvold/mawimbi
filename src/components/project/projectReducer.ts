export type ProjectState = {
  nextTrackId: number;
  title: string;
  tracks: Track[];
};

export type ProjectAction = [string, any?];

export type Track = {
  audioBuffer: AudioBuffer;
  color: TrackColor;
  id: number;
  index: number;
  mute: boolean;
  solo: boolean;
  volume: number;
};

type TrackColor = {
  r: number;
  g: number;
  b: number;
};

const COLOR_PALETTE: TrackColor[] = [
  { r: 77, g: 238, b: 234 },
  { r: 116, g: 238, b: 21 },
  { r: 255, g: 231, b: 0 },
  { r: 240, g: 0, b: 255 },
  { r: 0, g: 30, b: 255 },
];

export const ADD_TRACK = 'ADD_TRACK';
export const MOVE_TRACK = 'MOVE_TRACK';
export const SET_TRACK_MUTE = 'SET_TRACK_MUTE';
export const SET_TRACK_SOLO = 'SET_TRACK_SOLO';
export const SET_TRACK_VOLUME = 'SET_TRACK_VOLUME';

export function projectReducer(
  state: ProjectState,
  [type, payload]: ProjectAction
): ProjectState {
  console.log(type);
  switch (type) {
    case ADD_TRACK:
      return {
        ...state,
        nextTrackId: state.nextTrackId + 1,
        tracks: [...state.tracks, createTrack(state.nextTrackId, payload)],
      };
    case MOVE_TRACK:
      return { ...state, tracks: moveTrack(state.tracks, payload) };
    case SET_TRACK_MUTE:
      return { ...state, tracks: setTrackMute(state.tracks, payload) };
    case SET_TRACK_SOLO:
      return { ...state, tracks: setTrackSolo(state.tracks, payload) };
    case SET_TRACK_VOLUME:
      return { ...state, tracks: setTrackVolume(state.tracks, payload) };
    default:
      throw new Error();
  }
}

function createTrack(id: number, audioBuffer: AudioBuffer): Track {
  const colorIndex = id % COLOR_PALETTE.length;
  return {
    audioBuffer,
    color: COLOR_PALETTE[colorIndex],
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

function setTrackMute(tracks: Track[], { id, mute }: any): Track[] {
  return tracks.map((track) => (track.id === id ? { ...track, mute } : track));
}

function setTrackSolo(tracks: Track[], { id, solo }: any): Track[] {
  return tracks.map((track) => (track.id === id ? { ...track, solo } : track));
}

function setTrackVolume(tracks: Track[], { id, volume }: any): Track[] {
  return tracks.map((track) =>
    track.id === id ? { ...track, volume } : track
  );
}
