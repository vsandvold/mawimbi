import { vi } from 'vitest';
import * as Tone from 'tone';
import MicrophoneUserMedia from '../MicrophoneUserMedia';
import FrequencyVisualizer from '../FrequencyVisualizer';

vi.mock('../FrequencyVisualizer', () => ({
  // Must be a regular function (not arrow) to support `new`
  default: vi.fn().mockImplementation(function () {
    return {
      frequencyBinCount: 774,
      getVisualizationData: vi.fn().mockReturnValue(new Uint8Array(774)),
      dispose: vi.fn(),
    };
  }),
}));

let mic: MicrophoneUserMedia;

beforeEach(() => {
  mic = new MicrophoneUserMedia();
});

describe('constructor', () => {
  it('creates a Tone.Meter', () => {
    expect(Tone.Meter).toHaveBeenCalled();
  });

  it('creates a Tone.UserMedia connected to the meter', () => {
    expect(Tone.UserMedia).toHaveBeenCalled();

    const userMediaInstance = vi.mocked(Tone.UserMedia).mock.results[0].value;
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;

    expect(userMediaInstance.connect).toHaveBeenCalledWith(meterInstance);
  });

  it('creates a FrequencyVisualizer connected to the microphone', () => {
    const userMediaInstance = vi.mocked(Tone.UserMedia).mock.results[0].value;
    expect(FrequencyVisualizer).toHaveBeenCalledWith(userMediaInstance);
  });
});

describe('frequencyBinCount', () => {
  it('returns the bin count from the visualizer', () => {
    expect(mic.frequencyBinCount).toBe(774);
  });
});

describe('getVisualizationData', () => {
  it('returns a Uint8Array from the visualizer', () => {
    const data = mic.getVisualizationData();

    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(774);
  });
});
