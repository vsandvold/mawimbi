import { AudioBuffer } from 'standardized-audio-context-mock';
import { Track } from './components/project/projectPageReducer';

// This pattern is useful for asserting the props passed to a child component
//
// jest.mock('../Scrubber');
// const mockScrubber = jest.fn(({ children }) => (
//   <div data-testid="scrubber">{children}</div>
// ));
// (Scrubber as jest.Mock).mockImplementation(mockScrubber);

export function mockTrack(trackProps: any = {}): Track {
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
