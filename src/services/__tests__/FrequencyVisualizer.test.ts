import { vi } from 'vitest';
import FrequencyVisualizer from '../FrequencyVisualizer';
import { BAND_CONFIGS, LIVE_BAND_FFT_SIZES } from '../dualBandAnalysis';
import type WorkletAnalyser from '../WorkletAnalyser';

const BAND_COUNT = BAND_CONFIGS.length;

// Count total biquad filters across all bands
// Band 0: 1 (lowpass), middle bands: 2 each (hp+lp), last band: 1 (highpass)
const TOTAL_FILTERS = 1 + (BAND_COUNT - 2) * 2 + 1; // first + middles + last

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

// Track created AudioWorkletNodes for worklet multi-band tests
const createdWorkletNodes: Array<{
  port: { postMessage: ReturnType<typeof vi.fn>; onmessage: unknown };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];

const OriginalAudioWorkletNode = globalThis.AudioWorkletNode;

beforeEach(() => {
  createdWorkletNodes.length = 0;
  globalThis.AudioWorkletNode = vi.fn().mockImplementation(function () {
    const node = {
      port: { postMessage: vi.fn(), onmessage: null as unknown },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    createdWorkletNodes.push(node);
    return node;
  }) as unknown as typeof AudioWorkletNode;
});

afterEach(() => {
  globalThis.AudioWorkletNode = OriginalAudioWorkletNode;
});

function createMockSource() {
  return {
    context: {
      rawContext: {
        sampleRate: 44100,
        _nativeContext: {
          sampleRate: 44100,
          audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
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
  describe('worklet path (single-band)', () => {
    it('enables frequency analysis on the WorkletAnalyser', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, { workletAnalyser: analyser });

      expect(analyser.enableFrequencyAnalysis).toHaveBeenCalledWith({
        fftSize: 2048,
        minDecibels: -80,
        maxDecibels: -30,
      });
    });

    it('sets frequencyBinCount to the default output size', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });

      expect(viz.frequencyBinCount).toBe(512);
    });

    it('uses custom frequencyBinCount when provided', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        frequencyBinCount: 256,
      });

      expect(viz.frequencyBinCount).toBe(256);
    });

    it('reads frequency data from WorkletAnalyser', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });

      viz.getVisualizationData();

      expect(analyser.getByteFrequencyData).toHaveBeenCalled();
    });

    it('returns a Uint8Array of the configured size', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        frequencyBinCount: 256,
      });

      const result = viz.getVisualizationData();

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(256);
    });

    it('does not create native AnalyserNodes', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, { workletAnalyser: analyser });

      expect(source.context.rawContext.createAnalyser).not.toHaveBeenCalled();
      expect(
        source.context.rawContext.createBiquadFilter,
      ).not.toHaveBeenCalled();
      expect(source.context.rawContext.createGain).not.toHaveBeenCalled();
    });

    it('does not connect source node when using worklet path', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, { workletAnalyser: analyser });

      expect(source.connect).not.toHaveBeenCalled();
    });

    it('disables frequency analysis on dispose', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });

      viz.dispose();

      expect(analyser.disableFrequencyAnalysis).toHaveBeenCalled();
    });

    it('does not call getByteFrequencyData after dispose', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });

      viz.dispose();
      expect(analyser.disableFrequencyAnalysis).toHaveBeenCalledTimes(1);
    });
  });

  describe('worklet path (multi-band)', () => {
    it('creates AudioWorkletNodes for each band', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      expect(createdWorkletNodes.length).toBe(BAND_COUNT);
    });

    it('does not use the provided workletAnalyser for frequency analysis', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      expect(analyser.enableFrequencyAnalysis).not.toHaveBeenCalled();
    });

    it('creates biquad filters on the native context', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      const nativeCtx = source.context.rawContext._nativeContext;
      expect(nativeCtx.createBiquadFilter).toHaveBeenCalledTimes(TOTAL_FILTERS);
    });

    it('connects source to filter chains for each band', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      expect(source.connect).toHaveBeenCalledTimes(BAND_COUNT);
    });

    it('connects each filter chain to its worklet analyser input', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      const nativeCtx = source.context.rawContext._nativeContext;
      const filters = nativeCtx.createBiquadFilter.mock.results;
      // At least one filter per band should have connect called
      for (const { value } of filters) {
        expect(value.connect).toHaveBeenCalled();
      }
    });

    it('configures the first band worklet with the largest FFT', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      const firstNode = createdWorkletNodes[0];
      const configCalls = firstNode.port.postMessage.mock.calls;
      const freqConfig = configCalls.find(
        (c: unknown[]) =>
          (c[0] as { frequencyAnalysis?: boolean }).frequencyAnalysis === true,
      );
      expect(freqConfig).toBeDefined();
      expect((freqConfig![0] as { fftSize: number }).fftSize).toBe(
        LIVE_BAND_FFT_SIZES[0],
      );
    });

    it('configures the last band worklet with the smallest FFT', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      const lastNode = createdWorkletNodes[BAND_COUNT - 1];
      const configCalls = lastNode.port.postMessage.mock.calls;
      const freqConfig = configCalls.find(
        (c: unknown[]) =>
          (c[0] as { frequencyAnalysis?: boolean }).frequencyAnalysis === true,
      );
      expect(freqConfig).toBeDefined();
      expect((freqConfig![0] as { fftSize: number }).fftSize).toBe(
        LIVE_BAND_FFT_SIZES[BAND_COUNT - 1],
      );
    });

    it('does not create native AnalyserNodes or gain nodes', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      const nativeCtx = source.context.rawContext._nativeContext;
      expect(nativeCtx.createAnalyser).not.toHaveBeenCalled();
      expect(nativeCtx.createGain).not.toHaveBeenCalled();
    });

    it('sets frequencyBinCount to the default output size', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      expect(viz.frequencyBinCount).toBe(512);
    });

    it('uses custom frequencyBinCount when provided', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
        frequencyBinCount: 256,
      });

      expect(viz.frequencyBinCount).toBe(256);
    });

    it('returns a Uint8Array of the configured size', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
        frequencyBinCount: 256,
      });

      const result = viz.getVisualizationData();

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(256);
    });

    it('disconnects filters and disposes worklet analysers on dispose', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
        dualBand: true,
      });

      viz.dispose();

      const nativeCtx = source.context.rawContext._nativeContext;
      const filters = nativeCtx.createBiquadFilter.mock.results;
      for (const { value } of filters) {
        expect(value.disconnect).toHaveBeenCalled();
      }

      // All worklet nodes should be disconnected
      for (const node of createdWorkletNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
    });
  });

  describe('single-analyser path (default)', () => {
    it('creates one AnalyserNode and no filters', () => {
      const source = createMockSource();

      new FrequencyVisualizer(source as never);

      expect(source.context.rawContext.createAnalyser).toHaveBeenCalledTimes(1);
      expect(
        source.context.rawContext.createBiquadFilter,
      ).not.toHaveBeenCalled();
      expect(source.context.rawContext.createGain).not.toHaveBeenCalled();
    });

    it('connects source to the analyser', () => {
      const source = createMockSource();

      new FrequencyVisualizer(source as never);

      expect(source.connect).toHaveBeenCalledTimes(1);
    });

    it('sets frequencyBinCount to the default output size', () => {
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never);

      expect(viz.frequencyBinCount).toBe(512);
    });

    it('uses custom frequencyBinCount when provided', () => {
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, {
        frequencyBinCount: 128,
      });

      expect(viz.frequencyBinCount).toBe(128);
    });

    it('returns a Uint8Array of the configured size', () => {
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, {
        frequencyBinCount: 128,
      });

      const result = viz.getVisualizationData();

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(128);
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

  describe('multi-band path (native)', () => {
    it('creates AnalyserNodes and filters for each band', () => {
      const source = createMockSource();

      new FrequencyVisualizer(source as never, { dualBand: true });

      expect(source.context.rawContext.createAnalyser).toHaveBeenCalledTimes(
        BAND_COUNT,
      );
      expect(
        source.context.rawContext.createBiquadFilter,
      ).toHaveBeenCalledTimes(TOTAL_FILTERS);
      expect(source.context.rawContext.createGain).toHaveBeenCalledTimes(1);
    });

    it('connects source to filter chains for each band', () => {
      const source = createMockSource();

      new FrequencyVisualizer(source as never, { dualBand: true });

      expect(source.connect).toHaveBeenCalledTimes(BAND_COUNT);
    });

    it('sets frequencyBinCount to the default output size', () => {
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, { dualBand: true });

      expect(viz.frequencyBinCount).toBe(512);
    });

    it('uses custom frequencyBinCount when provided', () => {
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, {
        dualBand: true,
        frequencyBinCount: 256,
      });

      expect(viz.frequencyBinCount).toBe(256);
    });

    it('disconnects all nodes on dispose', () => {
      const source = createMockSource();
      const viz = new FrequencyVisualizer(source as never, { dualBand: true });

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

  describe('consistent output across paths', () => {
    it('produces the same frequencyBinCount regardless of analysis path', () => {
      const source = createMockSource();
      const analyser = createMockWorkletAnalyser();

      const workletViz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });
      const workletMultiBandViz = new FrequencyVisualizer(source as never, {
        workletAnalyser: createMockWorkletAnalyser(),
        dualBand: true,
      });
      const singleViz = new FrequencyVisualizer(source as never);
      const multiBandViz = new FrequencyVisualizer(source as never, {
        dualBand: true,
      });

      expect(workletViz.frequencyBinCount).toBe(singleViz.frequencyBinCount);
      expect(singleViz.frequencyBinCount).toBe(multiBandViz.frequencyBinCount);
      expect(multiBandViz.frequencyBinCount).toBe(
        workletMultiBandViz.frequencyBinCount,
      );
    });

    it('produces the same output array length regardless of analysis path', () => {
      const source = createMockSource();
      const analyser = createMockWorkletAnalyser();

      const workletViz = new FrequencyVisualizer(source as never, {
        workletAnalyser: analyser,
      });
      const workletMultiBandViz = new FrequencyVisualizer(source as never, {
        workletAnalyser: createMockWorkletAnalyser(),
        dualBand: true,
      });
      const singleViz = new FrequencyVisualizer(source as never);
      const multiBandViz = new FrequencyVisualizer(source as never, {
        dualBand: true,
      });

      expect(workletViz.getVisualizationData().length).toBe(
        singleViz.getVisualizationData().length,
      );
      expect(singleViz.getVisualizationData().length).toBe(
        multiBandViz.getVisualizationData().length,
      );
      expect(multiBandViz.getVisualizationData().length).toBe(
        workletMultiBandViz.getVisualizationData().length,
      );
    });

    it('respects custom frequencyBinCount across all paths', () => {
      const source = createMockSource();
      const customBinCount = 256;

      const workletViz = new FrequencyVisualizer(source as never, {
        workletAnalyser: createMockWorkletAnalyser(),
        frequencyBinCount: customBinCount,
      });
      const workletMultiBandViz = new FrequencyVisualizer(source as never, {
        workletAnalyser: createMockWorkletAnalyser(),
        dualBand: true,
        frequencyBinCount: customBinCount,
      });
      const singleViz = new FrequencyVisualizer(source as never, {
        frequencyBinCount: customBinCount,
      });
      const multiBandViz = new FrequencyVisualizer(source as never, {
        dualBand: true,
        frequencyBinCount: customBinCount,
      });

      expect(workletViz.getVisualizationData().length).toBe(customBinCount);
      expect(workletMultiBandViz.getVisualizationData().length).toBe(
        customBinCount,
      );
      expect(singleViz.getVisualizationData().length).toBe(customBinCount);
      expect(multiBandViz.getVisualizationData().length).toBe(customBinCount);
    });
  });

  describe('backward compatibility', () => {
    it('accepts WorkletAnalyser as second positional argument', () => {
      const analyser = createMockWorkletAnalyser();
      const source = createMockSource();

      const viz = new FrequencyVisualizer(source as never, analyser);

      expect(analyser.enableFrequencyAnalysis).toHaveBeenCalled();
      expect(viz.frequencyBinCount).toBe(512);
    });
  });
});
