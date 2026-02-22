export type ProjectState = {
  nextColorId: number;
  nextIndex: number;
  title: string;
  tracks: Track[];
};

export type ProjectAction = [string, any?];

export type TrackId = string;

export type Track = {
  trackId: TrackId;
  color: TrackColor;
  fileName: string;
  index: number;
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
export const MOVE_TRACK = 'MOVE_TRACK';

export function projectReducer(
  state: ProjectState,
  [type, payload]: ProjectAction,
): ProjectState {
  switch (type) {
    case ADD_TRACK:
      return {
        ...state,
        nextColorId: (state.nextColorId + 1) % COLOR_PALETTE.length,
        nextIndex: state.nextIndex + 1,
        tracks: [
          ...state.tracks,
          createTrack(state.nextIndex, state.nextColorId, payload),
        ],
      };
    case MOVE_TRACK:
      return { ...state, tracks: moveTrack(state.tracks, payload) };
    default:
      throw new Error();
  }
}

function createTrack(
  index: number,
  colorIdx: number,
  { trackId, fileName }: any,
): Track {
  return {
    color: COLOR_PALETTE[colorIdx],
    fileName,
    trackId,
    index,
  };
}

function moveTrack(tracks: Track[], { fromIndex, toIndex }: any): Track[] {
  const updatedTracks = [...tracks];
  const [removed] = updatedTracks.splice(fromIndex, 1);
  updatedTracks.splice(toIndex, 0, removed);
  return updatedTracks.map((track, i) => ({ ...track, index: i }));
}
