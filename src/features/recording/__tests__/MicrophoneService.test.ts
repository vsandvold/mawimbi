import { vi } from 'vitest';
import * as Tone from 'tone';
import MicrophoneService, {
  DEFAULT_MONITOR_VOLUME,
  LOW_LATENCY_CONSTRAINTS,
  MONITOR_LATENCY_WARNING_THRESHOLD_SECONDS,
  exceedsMonitorLatencyThreshold,
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

describe('monitoring', () => {
  function getInstances() {
    return {
      userMediaInstance: vi.mocked(Tone.UserMedia).mock.results[0].value,
      gainInstance: vi.mocked(Tone.Gain).mock.results[0].value,
    };
  }

  it('is off by default', () => {
    expect(mic.isMonitoring).toBe(false);
  });

  it('enabling connects mic -> gain -> destination', () => {
    const { userMediaInstance, gainInstance } = getInstances();

    mic.enableMonitoring();

    expect(userMediaInstance.connect).toHaveBeenCalledWith(gainInstance);
    expect(gainInstance.toDestination).toHaveBeenCalled();
    expect(mic.isMonitoring).toBe(true);
  });

  it('is a no-op when already enabled', () => {
    const { userMediaInstance } = getInstances();

    mic.enableMonitoring();
    userMediaInstance.connect.mockClear();
    mic.enableMonitoring();

    expect(userMediaInstance.connect).not.toHaveBeenCalled();
  });

  it('disabling disconnects mic and gain', () => {
    const { userMediaInstance, gainInstance } = getInstances();

    mic.enableMonitoring();
    mic.disableMonitoring();

    expect(userMediaInstance.disconnect).toHaveBeenCalledWith(gainInstance);
    expect(gainInstance.disconnect).toHaveBeenCalled();
    expect(mic.isMonitoring).toBe(false);
  });

  it('is a no-op when already disabled', () => {
    const { userMediaInstance } = getInstances();

    mic.disableMonitoring();

    expect(userMediaInstance.disconnect).not.toHaveBeenCalled();
  });

  it('sets gain via the dB conversion when the slider moves', () => {
    const { gainInstance } = getInstances();

    mic.setMonitorVolume(100);

    const expectedDb = 20 * Math.log(101 / 101);
    expect(gainInstance.gain.value).toBeCloseTo(Tone.dbToGain(expectedDb));
  });

  it('applies the default monitor volume at construction', () => {
    const { gainInstance } = getInstances();

    const expectedDb = 20 * Math.log((DEFAULT_MONITOR_VOLUME + 1) / 101);
    expect(gainInstance.gain.value).toBeCloseTo(Tone.dbToGain(expectedDb));
  });

  it('close() tears down monitoring', async () => {
    const { userMediaInstance, gainInstance } = getInstances();

    mic.enableMonitoring();
    await mic.open();
    mic.close();

    expect(userMediaInstance.disconnect).toHaveBeenCalledWith(gainInstance);
    expect(gainInstance.disconnect).toHaveBeenCalled();
    expect(mic.isMonitoring).toBe(false);
  });
});

describe('exceedsMonitorLatencyThreshold', () => {
  it('is false at and below the 50 ms threshold', () => {
    expect(
      exceedsMonitorLatencyThreshold(MONITOR_LATENCY_WARNING_THRESHOLD_SECONDS),
    ).toBe(false);
    expect(exceedsMonitorLatencyThreshold(0.03)).toBe(false);
  });

  it('is true above the 50 ms threshold', () => {
    expect(exceedsMonitorLatencyThreshold(0.051)).toBe(true);
  });
});
