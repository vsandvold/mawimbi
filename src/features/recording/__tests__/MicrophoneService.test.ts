import { vi } from 'vitest';
import * as Tone from 'tone';
import MicrophoneService, {
  LOW_LATENCY_CONSTRAINTS,
} from '../MicrophoneService';

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
