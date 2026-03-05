import { vi } from 'vitest';
import * as Tone from 'tone';
import MicrophoneService, {
  LOW_LATENCY_CONSTRAINTS,
} from '../MicrophoneService';
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

function createMockMediaStream(): MediaStream {
  return {
    active: true,
    getAudioTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
}

let mic: MicrophoneService;
let mockGetUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetUserMedia = vi.fn().mockResolvedValue(createMockMediaStream());
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });
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

describe('open', () => {
  it('calls getUserMedia with low-latency constraints', async () => {
    await mic.open();

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: LOW_LATENCY_CONSTRAINTS,
    });
  });

  it('includes latency: 0 in the constraints', () => {
    expect(LOW_LATENCY_CONSTRAINTS).toHaveProperty('latency', 0);
  });

  it('exposes the acquired stream', async () => {
    const mockStream = createMockMediaStream();
    mockGetUserMedia.mockResolvedValueOnce(mockStream);

    await mic.open();

    expect(mic.stream).toBe(mockStream);
  });

  it('closes the previous stream before opening a new one', async () => {
    const userMediaInstance = vi.mocked(Tone.UserMedia).mock.results[0].value;

    // First open
    await mic.open();
    // Make isOpen return true by setting state to 'started'
    userMediaInstance.state = 'started';

    // Second open should close first
    await mic.open();

    expect(userMediaInstance.close).toHaveBeenCalled();
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
