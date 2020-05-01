import { AudioBuffer } from 'standardized-audio-context-mock';

export function createTrack(trackProps: any = {}) {
  return {
    audioBuffer: new AudioBuffer({ length: 10, sampleRate: 44100 }),
    color: {
      r: 255,
      g: 255,
      b: 255,
    },
    id: 0,
    index: 0,
    mute: false,
    solo: false,
    volume: 100,
    ...trackProps,
  };
}
