import { vi } from 'vitest';
import { analyseCQTFromAudioBuffer } from '../CQTAnalyser';
import LiveCQTAnalyser from '../LiveCQTAnalyser';

// The worklet processor extends the AudioWorkletProcessor global and calls
// registerProcessor() at module load time, neither of which exist in jsdom.
// Stub both before importing so the module evaluates the same way it would
// inside a real AudioWorklet scope.
class MockAudioWorkletProcessor {
  port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };
}
vi.stubGlobal('AudioWorkletProcessor', MockAudioWorkletProcessor);
vi.stubGlobal('registerProcessor', vi.fn());

const { default: AnalysisProcessor } = await import('../AnalysisProcessor');

const SAMPLE_RATE = 44100;
const TONE_FREQUENCY_HZ = 440;
const TONE_DURATION_S = 0.5;
const RENDER_QUANTUM = 128;

type CqtMessage = { type: 'cqtData'; bins: Uint8Array };

function isCqtMessage(msg: unknown): msg is CqtMessage {
  return (msg as { type?: string }).type === 'cqtData';
}

// TypeScript resolves `processor.port` to the real DOM `MessagePort` type
// (inherited from `AudioWorkletProcessor`), which has no `.mock` — cast to
// the mocked shape actually installed by MockAudioWorkletProcessor above.
function getPostMessageCalls(
  processor: InstanceType<typeof AnalysisProcessor>,
): unknown[] {
  const port = processor.port as unknown as {
    postMessage: ReturnType<typeof vi.fn>;
  };
  return port.postMessage.mock.calls.map((call) => call[0]);
}

function peakBin(frame: Uint8Array): number {
  let peak = 0;
  for (let i = 1; i < frame.length; i++) {
    if (frame[i] > frame[peak]) peak = i;
  }
  return peak;
}

function generateToneSamples(): Float32Array {
  const totalSamples = Math.ceil(TONE_DURATION_S * SAMPLE_RATE);
  const signal = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    signal[i] = Math.sin((2 * Math.PI * TONE_FREQUENCY_HZ * i) / SAMPLE_RATE);
  }
  return signal;
}

describe('AnalysisProcessor', () => {
  it('computes CQT frames whose peak bin matches the offline CQT analyser within ±2 bins (12-TET guard)', () => {
    const processor = new AnalysisProcessor();
    const kernel = new LiveCQTAnalyser(SAMPLE_RATE).getSerializedKernel();

    processor.port.onmessage!({
      data: {
        type: 'configure',
        cqtAnalysis: true,
        cqtKernel: kernel,
      },
    } as MessageEvent);

    const signal = generateToneSamples();
    for (let offset = 0; offset < signal.length; offset += RENDER_QUANTUM) {
      const chunk = signal.subarray(
        offset,
        Math.min(offset + RENDER_QUANTUM, signal.length),
      );
      processor.process([[chunk]]);
    }

    const cqtMessages = getPostMessageCalls(processor).filter(isCqtMessage);
    expect(cqtMessages.length).toBeGreaterThan(0);
    const workletFrame = cqtMessages[cqtMessages.length - 1].bins;
    const workletPeakBin = peakBin(workletFrame);

    const offlineAudioBuffer = {
      numberOfChannels: 1,
      sampleRate: SAMPLE_RATE,
      length: signal.length,
      getChannelData: () => signal,
    } as unknown as AudioBuffer;
    const offlineData = analyseCQTFromAudioBuffer(offlineAudioBuffer);
    const offlineFrame =
      offlineData.frequencyFrames[offlineData.frequencyFrames.length - 1];
    const offlinePeakBin = peakBin(offlineFrame);

    expect(Math.abs(workletPeakBin - offlinePeakBin)).toBeLessThanOrEqual(2);
    expect(workletFrame[workletPeakBin]).toBeGreaterThan(0);
  });

  it('reports loudness independently of CQT analysis being enabled', () => {
    const processor = new AnalysisProcessor();

    const signal = generateToneSamples();
    for (let offset = 0; offset < signal.length; offset += RENDER_QUANTUM) {
      const chunk = signal.subarray(
        offset,
        Math.min(offset + RENDER_QUANTUM, signal.length),
      );
      processor.process([[chunk]]);
    }

    const loudnessMessages = getPostMessageCalls(processor).filter(
      (msg) => (msg as { type?: string }).type === 'loudness',
    );
    expect(loudnessMessages.length).toBeGreaterThan(0);
  });
});
