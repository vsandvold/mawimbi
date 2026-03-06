import { vi } from 'vitest';
import FrequencyVisualizer from '../FrequencyVisualizer';
import { computeNumberBins } from '../CQTAnalyser';
import type WorkletAnalyser from '../WorkletAnalyser';

const SAMPLE_RATE = 44100;
const CQT_BIN_COUNT = computeNumberBins(SAMPLE_RATE);

// --- Mocks ---

vi.mock('tone', () => ({
  context: {
    rawContext: {
      sampleRate: 44100,
      _nativeContext: {
        sampleRate: 44100,
      },
      createAnalyser: vi.fn(() => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        minDecibels: 0,
        maxDecibels: 0,
        frequencyBinCount: 4096,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getByteFrequencyData: vi.fn(),
        getFloatTimeDomainData: vi.fn(),
      })),
    },
  },
}));

function createMockSource() {
  return {
    context: {
      rawContext: {
        sampleRate: SAMPLE_RATE,
        _nativeContext: {
          sampleRate: SAMPLE_RATE,
        },
        createAnalyser: vi.fn(() => ({
          fftSize: 0,
          smoothingTimeConstant: 0,
          minDecibels: 0,
          maxDecibels: 0,
          frequencyBinCount: 4096,
          connect: vi.fn(),
          disconnect: vi.fn(),
          getByteFrequencyData: vi.fn(),
          getFloatTimeDomainData: vi.fn(),
        })),
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
    getCQTData: vi.fn().mockReturnValue(true),
    enableFrequencyAnalysis: vi.fn(),
    disableFrequencyAnalysis: vi.fn(),
    enableCQTAnalysis: vi.fn(),
    disableCQTAnalysis: vi.fn(),
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
    get cqtBinCount() {
      return CQT_BIN_COUNT;
    },
    ...overrides,
  } as unknown as WorkletAnalyser;
}

describe('FrequencyVisualizer', () => {
  describe('worklet CQT path', () => {
    it('enables CQT analysis on the WorkletAnalyser', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, { workletAnalyser: analyser });

      expect(analyser.enableCQTAnalysis).toHaveBeenCalledWith(SAMPLE_RATE);
    });

    it('sets frequencyBinCount to the CQT bin count', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });

      expect(viz.frequencyBinCount).toBe(CQT_BIN_COUNT);
    });

    it('reads CQT data from WorkletAnalyser', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });

      viz.getVisualizationData();

      expect(analyser.getCQTData).toHaveBeenCalled();
    });

    it('returns a Uint8Array of the CQT bin count', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });

      const result = viz.getVisualizationData();

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(CQT_BIN_COUNT);
    });

    it('does not create native AnalyserNodes', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, { workletAnalyser: analyser });

      expect(source.context.rawContext.createAnalyser).not.toHaveBeenCalled();
    });

    it('does not connect source node when using worklet path', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, { workletAnalyser: analyser });

      expect(source.connect).not.toHaveBeenCalled();
    });

    it('disables CQT analysis on dispose', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });

      viz.dispose();

      expect(analyser.disableCQTAnalysis).toHaveBeenCalled();
    });
  });

  describe('native CQT fallback path', () => {
    it('creates one AnalyserNode', () => {
      const source = createMockSource();

      new FrequencyVisualizer(source as never);

      expect(source.context.rawContext.createAnalyser).toHaveBeenCalledTimes(1);
    });

    it('connects source to the analyser', () => {
      const source = createMockSource();

      new FrequencyVisualizer(source as never);

      expect(source.connect).toHaveBeenCalledTimes(1);
    });

    it('sets frequencyBinCount to the CQT bin count', () => {
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never);

      expect(viz.frequencyBinCount).toBe(CQT_BIN_COUNT);
    });

    it('returns a Uint8Array of the CQT bin count', () => {
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never);

      const result = viz.getVisualizationData();

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(CQT_BIN_COUNT);
    });

    it('disconnects analyser on dispose', () => {
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never);

      viz.dispose();

      const analysers = source.context.rawContext.createAnalyser.mock.results;
      for (const { value } of analysers) {
        expect(value.disconnect).toHaveBeenCalled();
      }
    });
  });

  describe('consistent output across paths', () => {
    it('produces the same frequencyBinCount regardless of analysis path', () => {
      const source = createMockSource();
      const analyser = createMockWorkletAnalyser();

      const workletViz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });
      const nativeViz = new FrequencyVisualizer(source as never);

      expect(workletViz.frequencyBinCount).toBe(nativeViz.frequencyBinCount);
      expect(workletViz.frequencyBinCount).toBe(CQT_BIN_COUNT);
    });

    it('produces the same output array length regardless of analysis path', () => {
      const source = createMockSource();
      const analyser = createMockWorkletAnalyser();

      const workletViz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });
      const nativeViz = new FrequencyVisualizer(source as never);

      expect(workletViz.getVisualizationData().length).toBe(
        nativeViz.getVisualizationData().length,
      );
    });
  });

  describe('backward compatibility', () => {
    it('accepts WorkletAnalyser as second positional argument', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, analyser);

      expect(analyser.enableCQTAnalysis).toHaveBeenCalled();
      expect(viz.frequencyBinCount).toBe(CQT_BIN_COUNT);
    });
  });
});
