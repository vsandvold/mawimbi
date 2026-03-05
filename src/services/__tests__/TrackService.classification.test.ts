import { vi } from 'vitest';
import * as Tone from 'tone';
import TrackService from '../TrackService';

// jsdom doesn't implement URL.createObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
}

function mockAudioBuffer(overrides: Partial<AudioBuffer> = {}): AudioBuffer {
  const channelData = new Float32Array(100).fill(0.2);
  return {
    numberOfChannels: 1,
    length: 100,
    sampleRate: 44100,
    duration: 100 / 44100,
    getChannelData: vi.fn().mockReturnValue(channelData),
    ...overrides,
  } as unknown as AudioBuffer;
}

let service: TrackService;

beforeEach(() => {
  vi.mocked(Tone.context.decodeAudioData).mockResolvedValue(mockAudioBuffer());
  service = new TrackService(Tone.context);
});

describe('TrackService track creation callback', () => {
  it('calls onTrackCreated after createTrack', async () => {
    const callback = vi.fn();
    service.setOnTrackCreated(callback);

    const { trackId } = await service.createTrack(new ArrayBuffer(16));

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(trackId, expect.any(Object));
  });

  it('calls onTrackCreated after createRecordedTrack', () => {
    const callback = vi.fn();
    service.setOnTrackCreated(callback);
    const audioBuffer = mockAudioBuffer({ duration: 5.0 });

    const { trackId } = service.createRecordedTrack(
      audioBuffer,
      new ArrayBuffer(16),
      3.0,
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(trackId, audioBuffer);
  });

  it('does not throw when no callback is registered', async () => {
    await expect(
      service.createTrack(new ArrayBuffer(16)),
    ).resolves.toBeDefined();
  });

  it('passes the decoded audio buffer to the callback', async () => {
    const decodedBuffer = mockAudioBuffer({ duration: 2.0 });
    vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(
      decodedBuffer,
    );
    const callback = vi.fn();
    service.setOnTrackCreated(callback);

    await service.createTrack(new ArrayBuffer(16));

    expect(callback.mock.calls[0][1]).toBe(decodedBuffer);
  });
});
