import LatencyCompensation from '../LatencyCompensation';

const SAMPLE_RATE = 44100;

function createCompensation(
  overrides: {
    outputLatency?: number;
    baseLatency?: number;
    sampleRate?: number;
    lookAhead?: number;
  } = {},
) {
  const rawContext = {
    sampleRate: overrides.sampleRate ?? SAMPLE_RATE,
    outputLatency: overrides.outputLatency ?? 0.01,
    baseLatency: overrides.baseLatency ?? 0.005,
  };
  return new LatencyCompensation(rawContext, overrides.lookAhead ?? 0.05);
}

describe('LatencyCompensation', () => {
  describe('getOutputLatency', () => {
    it('returns the context outputLatency', () => {
      const lc = createCompensation({ outputLatency: 0.012 });

      expect(lc.getOutputLatency()).toBe(0.012);
    });

    it('returns 0 when outputLatency is not exposed', () => {
      const lc = new LatencyCompensation({ sampleRate: SAMPLE_RATE }, 0.05);

      expect(lc.getOutputLatency()).toBe(0);
    });
  });

  describe('getBaseLatency', () => {
    it('returns the context baseLatency', () => {
      const lc = createCompensation({ baseLatency: 0.003 });

      expect(lc.getBaseLatency()).toBe(0.003);
    });

    it('returns 0 when baseLatency is not exposed', () => {
      const lc = new LatencyCompensation({ sampleRate: SAMPLE_RATE }, 0.05);

      expect(lc.getBaseLatency()).toBe(0);
    });
  });

  describe('getInputLatency', () => {
    it('returns one render quantum at the context sample rate', () => {
      const lc = createCompensation({ sampleRate: 44100 });

      // 128 / 44100 ≈ 0.002902 seconds
      expect(lc.getInputLatency()).toBeCloseTo(128 / 44100, 6);
    });

    it('scales with sample rate', () => {
      const lc = createCompensation({ sampleRate: 48000 });

      expect(lc.getInputLatency()).toBeCloseTo(128 / 48000, 6);
    });
  });

  describe('getLookAhead', () => {
    it('returns the configured look-ahead', () => {
      const lc = createCompensation({ lookAhead: 0.05 });

      expect(lc.getLookAhead()).toBe(0.05);
    });
  });

  describe('getTotalCompensation', () => {
    it('sums all latency components', () => {
      const lc = createCompensation({
        outputLatency: 0.01,
        baseLatency: 0.005,
        lookAhead: 0.05,
        sampleRate: 44100,
      });

      const expected = 0.01 + 0.005 + 0.05 + 128 / 44100;

      expect(lc.getTotalCompensation()).toBeCloseTo(expected, 6);
    });

    it('handles missing optional latencies gracefully', () => {
      const lc = new LatencyCompensation({ sampleRate: SAMPLE_RATE }, 0.05);

      // outputLatency=0, baseLatency=0, lookAhead=0.05, input=128/44100
      const expected = 0.05 + 128 / 44100;

      expect(lc.getTotalCompensation()).toBeCloseTo(expected, 6);
    });
  });

  describe('compensationInSamples', () => {
    it('converts total compensation to integer sample count', () => {
      const lc = createCompensation({
        outputLatency: 0.01,
        baseLatency: 0.005,
        lookAhead: 0.05,
        sampleRate: 44100,
      });

      const totalSeconds = lc.getTotalCompensation();
      const expected = Math.floor(totalSeconds * 48000);

      expect(lc.compensationInSamples(48000)).toBe(expected);
    });
  });

  describe('trimBuffer', () => {
    function createMockBuffer(
      length: number,
      channels = 1,
      sampleRate = 44100,
    ): AudioBuffer {
      const channelArrays: Float32Array[] = [];
      for (let ch = 0; ch < channels; ch++) {
        const data = new Float32Array(length);
        for (let i = 0; i < length; i++) {
          data[i] = i + ch * 1000;
        }
        channelArrays.push(data);
      }

      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (ch: number) => channelArrays[ch],
      } as unknown as AudioBuffer;
    }

    // jsdom doesn't implement AudioBuffer constructor — provide a minimal stub
    const OriginalAudioBuffer = globalThis.AudioBuffer;

    beforeAll(() => {
      globalThis.AudioBuffer = class MockAudioBuffer {
        numberOfChannels: number;
        length: number;
        sampleRate: number;
        duration: number;
        private channels: Float32Array[];

        constructor(options: {
          numberOfChannels: number;
          length: number;
          sampleRate: number;
        }) {
          this.numberOfChannels = options.numberOfChannels;
          this.length = options.length;
          this.sampleRate = options.sampleRate;
          this.duration = options.length / options.sampleRate;
          this.channels = [];
          for (let ch = 0; ch < options.numberOfChannels; ch++) {
            this.channels.push(new Float32Array(options.length));
          }
        }

        getChannelData(ch: number): Float32Array {
          return this.channels[ch];
        }
      } as unknown as typeof AudioBuffer;
    });

    afterAll(() => {
      globalThis.AudioBuffer = OriginalAudioBuffer;
    });

    it('trims leading samples from a mono buffer', () => {
      const buffer = createMockBuffer(1000);
      const lc = createCompensation();
      const compensationSeconds = 100 / 44100;

      const trimmed = lc.trimBuffer(buffer, compensationSeconds);

      expect(trimmed.length).toBe(1000 - 100);
      expect(trimmed.getChannelData(0)[0]).toBe(100);
    });

    it('trims leading samples from a stereo buffer', () => {
      const buffer = createMockBuffer(1000, 2);
      const lc = createCompensation();
      const compensationSeconds = 50 / 44100;

      const trimmed = lc.trimBuffer(buffer, compensationSeconds);

      expect(trimmed.numberOfChannels).toBe(2);
      expect(trimmed.length).toBe(1000 - 50);
      expect(trimmed.getChannelData(0)[0]).toBe(50);
      expect(trimmed.getChannelData(1)[0]).toBe(1050);
    });

    it('returns the original buffer when compensation is zero', () => {
      const buffer = createMockBuffer(1000);
      const lc = createCompensation();

      const result = lc.trimBuffer(buffer, 0);

      expect(result).toBe(buffer);
    });

    it('returns the original buffer when compensation is negative', () => {
      const buffer = createMockBuffer(1000);
      const lc = createCompensation();

      const result = lc.trimBuffer(buffer, -0.01);

      expect(result).toBe(buffer);
    });

    it('returns the original buffer when compensation exceeds buffer length', () => {
      const buffer = createMockBuffer(100);
      const lc = createCompensation();
      const compensationSeconds = 200 / 44100;

      const result = lc.trimBuffer(buffer, compensationSeconds);

      expect(result).toBe(buffer);
    });
  });
});
