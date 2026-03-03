// AnalysisProcessor — AudioWorkletProcessor that computes RMS loudness
// on the audio thread, replacing Tone.Analyser (AnalyserNode) for
// lowest-latency real-time metering.
//
// Runs inside an AudioWorklet scope on a dedicated thread, eliminating
// main-thread contention during complex playback with many tracks.
//
// Message protocol:
//   Processor → Main:  { type: 'loudness', rms: number }
//   Main → Processor:  { type: 'configure', smoothing: number }

export type AnalysisMessage = { type: 'loudness'; rms: number };

export type AnalysisCommand = { type: 'configure'; smoothing: number };

// Exponential moving average coefficient. Higher values = smoother but
// more latent meter response.
const DEFAULT_SMOOTHING = 0.8;

// How often to post loudness updates. Every N-th process() call.
// At 128 samples / 44100 Hz ≈ 2.9ms per call, 8 calls ≈ 23ms ≈ 43 Hz
// update rate — sufficient for smooth meter animation.
const REPORT_INTERVAL = 8;

class AnalysisProcessor extends AudioWorkletProcessor {
  private smoothing = DEFAULT_SMOOTHING;
  private smoothedRms = 0;
  private callCount = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<AnalysisCommand>) => {
      if (event.data.type === 'configure') {
        this.smoothing = event.data.smoothing;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // RMS calculation on the audio thread
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    const instantRms = Math.sqrt(sumSquares / channelData.length);

    // Exponential moving average for smoothing
    this.smoothedRms =
      this.smoothing * this.smoothedRms + (1 - this.smoothing) * instantRms;

    this.callCount++;
    if (this.callCount >= REPORT_INTERVAL) {
      this.callCount = 0;
      this.port.postMessage({
        type: 'loudness',
        rms: this.smoothedRms,
      } satisfies AnalysisMessage);
    }

    return true;
  }
}

registerProcessor('analysis-processor', AnalysisProcessor);
