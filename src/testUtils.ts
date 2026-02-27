import { type Track } from './types/track';

export function mockTrack(trackProps: Partial<Track> = {}): Track {
  return {
    color: {
      r: 255,
      g: 255,
      b: 255,
    },
    fileName: 'test.wav',
    trackId: 'track-0',
    index: 0,
    ...trackProps,
  };
}
