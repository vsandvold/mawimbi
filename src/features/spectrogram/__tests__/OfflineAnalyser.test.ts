import { vi } from 'vitest';
import { computeNumberBins, HOP_SECONDS } from '../CQTAnalyser';
import OfflineAnalyser, { type SpectrogramData } from '../OfflineAnalyser';

// CQT bin count for 44100 Hz sample rate
const CQT_BIN_COUNT = computeNumberBins(44100);

function createAudioBuffer(
  duration: number,
  sampleRate = 44100,
  channels = 1,
): AudioBuffer {
  const length = Math.ceil(duration * sampleRate);
  return {
    duration,
    length,
    sampleRate,
    numberOfChannels: channels,
    getChannelData: vi.fn().mockReturnValue(new Float32Array(length)),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

describe('analyseToFrames (CQT)', () => {
  it('returns SpectrogramData with correct metadata', () => {
    const sampleRate = 44100;
    const duration = 0.1;
    const audioBuffer = createAudioBuffer(duration, sampleRate);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result: SpectrogramData = analyser.analyseToFrames();

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBeCloseTo(duration, 3);
    expect(result.frequencyBinCount).toBe(CQT_BIN_COUNT);
    expect(result.timeResolution).toBe(HOP_SECONDS);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
  });

  it('produces the expected number of frames', () => {
    const duration = 0.1;
    const audioBuffer = createAudioBuffer(duration);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = analyser.analyseToFrames();
    const expectedFrames = Math.floor(duration / HOP_SECONDS);

    expect(result.frequencyFrames).toHaveLength(expectedFrames);
  });

  it('stores each frame as an independent Uint8Array copy', () => {
    const audioBuffer = createAudioBuffer(0.1);
    const analyser = new OfflineAnalyser(audioBuffer);

    const result = analyser.analyseToFrames();

    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(CQT_BIN_COUNT);
    }

    if (result.frequencyFrames.length >= 2) {
      expect(result.frequencyFrames[0]).not.toBe(result.frequencyFrames[1]);
    }
  });
});
