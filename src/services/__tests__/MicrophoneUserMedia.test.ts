import { vi } from 'vitest';
import * as Tone from 'tone';
import MicrophoneUserMedia from '../MicrophoneUserMedia';

let mic: MicrophoneUserMedia;

beforeEach(() => {
  mic = new MicrophoneUserMedia();
});

describe('constructor', () => {
  it('creates a Tone.Meter', () => {
    expect(Tone.Meter).toHaveBeenCalled();
  });

  it('creates a Tone.Analyser with FFT type and size 2048', () => {
    expect(Tone.Analyser).toHaveBeenCalledWith({
      type: 'fft',
      size: 2048,
    });
  });

  it('creates a Tone.UserMedia connected to both meter and analyser', () => {
    expect(Tone.UserMedia).toHaveBeenCalled();

    const userMediaInstance = vi.mocked(Tone.UserMedia).mock.results[0].value;
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;
    const analyserInstance = vi.mocked(Tone.Analyser).mock.results[0].value;

    expect(userMediaInstance.connect).toHaveBeenCalledWith(meterInstance);
    expect(userMediaInstance.connect).toHaveBeenCalledWith(analyserInstance);
  });
});

describe('getFrequencyData', () => {
  it('returns a Float32Array from the analyser', () => {
    const data = mic.getFrequencyData();

    expect(data).toBeInstanceOf(Float32Array);
  });

  it('delegates to analyser.getValue()', () => {
    const analyserInstance = vi.mocked(Tone.Analyser).mock.results[0].value;
    const expectedData = new Float32Array([1, 2, 3]);
    analyserInstance.getValue.mockReturnValue(expectedData);

    const data = mic.getFrequencyData();

    expect(data).toBe(expectedData);
  });
});
