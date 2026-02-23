import { LoudnessNormalizer } from '../LoudnessNormalizer';

function createMockAudioBuffer(channelData: Float32Array[]): AudioBuffer {
  const numChannels = channelData.length;
  const length = channelData[0]?.length ?? 0;
  return {
    numberOfChannels: numChannels,
    length,
    sampleRate: 44100,
    duration: length / 44100,
    getChannelData: (ch: number) => channelData[ch],
  } as unknown as AudioBuffer;
}

describe('calculateRms', () => {
  it('returns 0 for an empty buffer', () => {
    const buffer = createMockAudioBuffer([new Float32Array(0)]);

    expect(LoudnessNormalizer.calculateRms(buffer)).toBe(0);
  });

  it('returns 0 for a silent buffer', () => {
    const buffer = createMockAudioBuffer([new Float32Array(100)]);

    expect(LoudnessNormalizer.calculateRms(buffer)).toBe(0);
  });

  it('returns correct RMS for a mono buffer', () => {
    // All samples at 0.5: RMS = sqrt(mean(0.25)) = 0.5
    const samples = new Float32Array(100).fill(0.5);
    const buffer = createMockAudioBuffer([samples]);

    expect(LoudnessNormalizer.calculateRms(buffer)).toBeCloseTo(0.5);
  });

  it('returns correct RMS for a full-scale sine-like signal', () => {
    // Alternating +1 and -1: RMS = sqrt(mean(1)) = 1
    const samples = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      samples[i] = i % 2 === 0 ? 1 : -1;
    }
    const buffer = createMockAudioBuffer([samples]);

    expect(LoudnessNormalizer.calculateRms(buffer)).toBeCloseTo(1.0);
  });

  it('averages RMS across multiple channels', () => {
    // Channel 1: all 0.4 → sum of squares = 100 * 0.16 = 16
    // Channel 2: all 0.2 → sum of squares = 100 * 0.04 = 4
    // Mean square = (16 + 4) / (2 * 100) = 0.1
    // RMS = sqrt(0.1) ≈ 0.3162
    const ch1 = new Float32Array(100).fill(0.4);
    const ch2 = new Float32Array(100).fill(0.2);
    const buffer = createMockAudioBuffer([ch1, ch2]);

    expect(LoudnessNormalizer.calculateRms(buffer)).toBeCloseTo(Math.sqrt(0.1));
  });
});

describe('calculateNormalizationGain', () => {
  it('returns 0 dB for a silent buffer', () => {
    const buffer = createMockAudioBuffer([new Float32Array(100)]);

    expect(LoudnessNormalizer.calculateNormalizationGain(buffer)).toBe(0);
  });

  it('returns 0 dB for a near-silent buffer', () => {
    const samples = new Float32Array(100).fill(0.0005);
    const buffer = createMockAudioBuffer([samples]);

    expect(LoudnessNormalizer.calculateNormalizationGain(buffer)).toBe(0);
  });

  it('returns positive gain for a quiet buffer', () => {
    // RMS = 0.05, target = 0.2 → gain = 0.2/0.05 = 4 → 20*log10(4) ≈ 12.04 dB
    const samples = new Float32Array(100).fill(0.05);
    const buffer = createMockAudioBuffer([samples]);

    const gain = LoudnessNormalizer.calculateNormalizationGain(buffer);
    expect(gain).toBeCloseTo(20 * Math.log10(4));
  });

  it('returns 0 dB for a buffer already at target RMS', () => {
    const samples = new Float32Array(100).fill(0.2);
    const buffer = createMockAudioBuffer([samples]);

    expect(LoudnessNormalizer.calculateNormalizationGain(buffer)).toBeCloseTo(
      0,
    );
  });

  it('returns negative gain for a loud buffer', () => {
    // RMS = 0.8, target = 0.2 → gain = 0.2/0.8 = 0.25 → 20*log10(0.25) ≈ -12.04 dB
    const samples = new Float32Array(100).fill(0.8);
    const buffer = createMockAudioBuffer([samples]);

    const gain = LoudnessNormalizer.calculateNormalizationGain(buffer);
    expect(gain).toBeCloseTo(20 * Math.log10(0.25));
  });
});

describe('gainToInitialVolume', () => {
  it('returns 100 when normalization gain is 0 dB', () => {
    expect(LoudnessNormalizer.gainToInitialVolume(0)).toBe(100);
  });

  it('returns a value below 100 for positive gain', () => {
    // Positive gain means the track was amplified; original was quieter
    const volume = LoudnessNormalizer.gainToInitialVolume(12);
    expect(volume).toBeLessThan(100);
    expect(volume).toBeGreaterThan(0);
  });

  it('clamps to 100 for negative gain', () => {
    // Negative gain means the track was attenuated; original was louder
    const volume = LoudnessNormalizer.gainToInitialVolume(-12);
    expect(volume).toBe(100);
  });

  it('clamps to 0 for very large positive gain', () => {
    const volume = LoudnessNormalizer.gainToInitialVolume(200);
    expect(volume).toBe(0);
  });

  it('rounds to the nearest integer', () => {
    const volume = LoudnessNormalizer.gainToInitialVolume(6);
    expect(Number.isInteger(volume)).toBe(true);
  });
});
