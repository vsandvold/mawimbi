import { vi } from 'vitest';
import * as Tone from 'tone';
import MicrophoneService from '../MicrophoneService';

let mic: MicrophoneService;

beforeEach(() => {
  mic = new MicrophoneService();
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
});

describe('source', () => {
  it('exposes the Tone.UserMedia as a source node', () => {
    const userMediaInstance = vi.mocked(Tone.UserMedia).mock.results[0].value;
    expect(mic.source).toBe(userMediaInstance);
  });
});
