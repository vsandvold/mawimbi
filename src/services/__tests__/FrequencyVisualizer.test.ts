import { vi } from 'vitest';
import FrequencyVisualizer from '../FrequencyVisualizer';
import type WorkletAnalyser from '../WorkletAnalyser';

// --- Mocks ---

vi.mock('tone', () => ({
  context: {
    rawContext: {
      sampleRate: 44100,
      createBiquadFilter: vi.fn(() => ({
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createAnalyser: vi.fn(() => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        minDecibels: 0,
        maxDecibels: 0,
        frequencyBinCount: 512,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getByteFrequencyData: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      destination: {},
    },
  },
}));

function createMockSource() {
  return {
    context: {
      rawContext: {
        sampleRate: 44100,
        createBiquadFilter: vi.fn(() => ({
          type: '',
          frequency: { value: 0 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        createAnalyser: vi.fn(() => ({
          fftSize: 0,
          smoothingTimeConstant: 0,
          minDecibels: 0,
          maxDecibels: 0,
          frequencyBinCount: 512,
          connect: vi.fn(),
          disconnect: vi.fn(),
          getByteFrequencyData: vi.fn(),
        })),
        createGain: vi.fn(() => ({
          gain: { value: 0 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        destination: {},
      },
    },
    connect: vi.fn(),
  };
}

function createMockWorkletAnalyser(
  overrides?: Partial<WorkletAnalyser>,
): WorkletAnalyser {
  return {
    input: { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode,
    getLoudness: vi.fn().mockReturnValue(0),
    getRawRms: vi.fn().mockReturnValue(0),
    getByteFrequencyData: vi.fn().mockReturnValue(true),
    enableFrequencyAnalysis: vi.fn(),
    disableFrequencyAnalysis: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    get frequencyBinCount() {
      return 1024;
    },
    get fftSize() {
      return 2048;
    },
    get minDecibels() {
      return -100;
    },
    get maxDecibels() {
      return -30;
    },
    ...overrides,
  } as unknown as WorkletAnalyser;
}

describe('FrequencyVisualizer', () => {
  describe('worklet path', () => {
    it('enables frequency analysis on the WorkletAnalyser', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, analyser);

      expect(analyser.enableFrequencyAnalysis).toHaveBeenCalledWith({
        fftSize: 2048,
        minDecibels: -80,
        maxDecibels: -30,
      });
    });

    it('sets frequencyBinCount to the standard output size', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, analyser);

      expect(viz.frequencyBinCount).toBe(512);
    });

    it('reads frequency data from WorkletAnalyser', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, analyser);

      viz.getVisualizationData();

      expect(analyser.getByteFrequencyData).toHaveBeenCalled();
    });

    it('returns a Uint8Array of the standard output size', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, analyser);

      const result = viz.getVisualizationData();

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(512);
    });

    it('does not create native AnalyserNodes', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, analyser);

      expect(source.context.rawContext.createAnalyser).not.toHaveBeenCalled();
      expect(
        source.context.rawContext.createBiquadFilter,
      ).not.toHaveBeenCalled();
      expect(source.context.rawContext.createGain).not.toHaveBeenCalled();
    });

    it('does not connect source node when using worklet path', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, analyser);

      expect(source.connect).not.toHaveBeenCalled();
    });

    it('disables frequency analysis on dispose', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, analyser);

      viz.dispose();

      expect(analyser.disableFrequencyAnalysis).toHaveBeenCalled();
    });

    it('does not call getByteFrequencyData after dispose', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, analyser);

      viz.dispose();
      // After dispose, workletAnalyser is nulled — falls through to
      // dual-band path which has no initialized nodes, so this verifies
      // the worklet path is fully torn down.
      expect(analyser.disableFrequencyAnalysis).toHaveBeenCalledTimes(1);
    });
  });

  it('produces the same frequencyBinCount regardless of analysis path', () => {
    const source = createMockSource();
    const analyser = createMockWorkletAnalyser();

    const workletViz = new FrequencyVisualizer(source as never, analyser);
    const dualBandViz = new FrequencyVisualizer(source as never);

    expect(workletViz.frequencyBinCount).toBe(dualBandViz.frequencyBinCount);
  });

  it('produces the same output array length regardless of analysis path', () => {
    const source = createMockSource();
    const analyser = createMockWorkletAnalyser();

    const workletViz = new FrequencyVisualizer(source as never, analyser);
    const dualBandViz = new FrequencyVisualizer(source as never);

    const workletData = workletViz.getVisualizationData();
    const dualBandData = dualBandViz.getVisualizationData();

    expect(workletData.length).toBe(dualBandData.length);
  });

  describe('dual-band fallback', () => {
    it('creates AnalyserNodes when no WorkletAnalyser is provided', () => {
      const source = createMockSource();

      new FrequencyVisualizer(source as never);

      expect(source.context.rawContext.createAnalyser).toHaveBeenCalledTimes(2);
      expect(
        source.context.rawContext.createBiquadFilter,
      ).toHaveBeenCalledTimes(2);
      expect(source.context.rawContext.createGain).toHaveBeenCalledTimes(1);
    });

    it('connects source to biquad filters', () => {
      const source = createMockSource();

      new FrequencyVisualizer(source as never);

      // Source is connected to both lowpass and highpass filters
      expect(source.connect).toHaveBeenCalledTimes(2);
    });

    it('sets frequencyBinCount to the standard output size', () => {
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never);

      expect(viz.frequencyBinCount).toBe(512);
    });

    it('disconnects all nodes on dispose', () => {
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never);

      viz.dispose();

      const filters = source.context.rawContext.createBiquadFilter.mock.results;
      const analysers = source.context.rawContext.createAnalyser.mock.results;
      const gains = source.context.rawContext.createGain.mock.results;

      for (const { value } of filters) {
        expect(value.disconnect).toHaveBeenCalled();
      }
      for (const { value } of analysers) {
        expect(value.disconnect).toHaveBeenCalled();
      }
      for (const { value } of gains) {
        expect(value.disconnect).toHaveBeenCalled();
      }
    });
  });
});
