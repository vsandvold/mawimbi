import { vi } from 'vitest';
import type * as Tone from 'tone';
import FrequencyVisualizer from '../FrequencyVisualizer';
import { spectrogramStats } from '../SpectrogramStats';
import type WorkletAnalyser from '../WorkletAnalyser';

function makeFakeSource(): Tone.ToneAudioNode {
  return { connect: vi.fn() } as unknown as Tone.ToneAudioNode;
}

function makeFakeWorkletAnalyser() {
  return {
    enableCQTAnalysis: vi.fn(),
    disableCQTAnalysis: vi.fn(),
    getCQTData: vi.fn().mockImplementation((output: Uint8Array) => {
      output[0] = 42;
      return true;
    }),
  } as unknown as WorkletAnalyser;
}

describe('FrequencyVisualizer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('worklet CQT path (spec 006 milestone 5)', () => {
    it('enables CQT analysis on the provided worklet analyser instead of falling back to the native path', () => {
      const incrementSpy = vi.spyOn(
        spectrogramStats,
        'incrementMainThreadCqtConstructions',
      );
      const analyser = makeFakeWorkletAnalyser();

      new FrequencyVisualizer(makeFakeSource(), { workletAnalyser: analyser });

      expect(analyser.enableCQTAnalysis).toHaveBeenCalledWith(44100);
      expect(incrementSpy).not.toHaveBeenCalled();
    });

    it('reads visualization data from the worklet analyser', () => {
      const analyser = makeFakeWorkletAnalyser();
      const visualizer = new FrequencyVisualizer(makeFakeSource(), {
        workletAnalyser: analyser,
      });

      const data = visualizer.getVisualizationData();

      expect(analyser.getCQTData).toHaveBeenCalled();
      expect(data[0]).toBe(42);
    });

    it('disables CQT analysis on the worklet analyser when disposed', () => {
      const analyser = makeFakeWorkletAnalyser();
      const visualizer = new FrequencyVisualizer(makeFakeSource(), {
        workletAnalyser: analyser,
      });

      visualizer.dispose();

      expect(analyser.disableCQTAnalysis).toHaveBeenCalled();
    });
  });

  describe('native main-thread fallback (worklet unavailable)', () => {
    it('falls back to the native CQT path and records the main-thread construction', () => {
      const incrementSpy = vi.spyOn(
        spectrogramStats,
        'incrementMainThreadCqtConstructions',
      );

      new FrequencyVisualizer(makeFakeSource());

      expect(incrementSpy).toHaveBeenCalledTimes(1);
    });

    it('returns visualization data without throwing before any samples have accumulated', () => {
      const visualizer = new FrequencyVisualizer(makeFakeSource());

      const data = visualizer.getVisualizationData();

      expect(data).toBeInstanceOf(Uint8Array);
    });

    it('disposes the native analyser without touching a worklet analyser', () => {
      const visualizer = new FrequencyVisualizer(makeFakeSource());

      expect(() => visualizer.dispose()).not.toThrow();
    });
  });
});
