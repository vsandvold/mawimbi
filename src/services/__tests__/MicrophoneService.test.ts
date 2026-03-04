import { vi } from 'vitest';
import * as Tone from 'tone';
import MicrophoneService from '../MicrophoneService';
import type WorkletAnalyser from '../WorkletAnalyser';

function createMockWorkletAnalyser(rawRms = 0): WorkletAnalyser {
  return {
    input: { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode,
    getLoudness: vi.fn().mockReturnValue(rawRms),
    getRawRms: vi.fn().mockReturnValue(rawRms),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  } as unknown as WorkletAnalyser;
}

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

describe('useWorkletAnalyser', () => {
  it('disconnects Tone.Meter and connects WorkletAnalyser to microphone', () => {
    const analyser = createMockWorkletAnalyser();
    const userMediaInstance = vi.mocked(Tone.UserMedia).mock.results[0].value;
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;

    mic.useWorkletAnalyser(analyser);

    expect(userMediaInstance.disconnect).toHaveBeenCalledWith(meterInstance);
    expect(userMediaInstance.connect).toHaveBeenCalledWith(analyser.input);
  });

  it('delegates getLoudness to WorkletAnalyser.getRawRms after upgrade', () => {
    const analyser = createMockWorkletAnalyser(0.42);

    mic.useWorkletAnalyser(analyser);

    expect(mic.getLoudness()).toBe(0.42);
    expect(analyser.getRawRms).toHaveBeenCalled();
  });

  it('does not call Tone.Meter after upgrade', () => {
    const analyser = createMockWorkletAnalyser(0.5);
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;

    mic.useWorkletAnalyser(analyser);
    mic.getLoudness();

    expect(meterInstance.getValue).not.toHaveBeenCalled();
  });
});
