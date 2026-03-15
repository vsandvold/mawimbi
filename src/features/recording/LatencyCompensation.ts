// LatencyCompensation — measures round-trip audio latency and provides
// buffer trimming to align recorded audio with the transport timeline.
//
// Extracts latency estimation from RecordingService into a dedicated module
// with explicit getters for each latency component and a trimBuffer utility.

// One render quantum at 44.1 kHz (~2.9 ms). Conservative estimate for input
// latency when no hardware-specific measurement is available.
const RENDER_QUANTUM_FRAMES = 128;

type RawContext = {
  sampleRate: number;
  outputLatency?: number;
  baseLatency?: number;
};

class LatencyCompensation {
  private rawContext: RawContext;
  private lookAhead: number;

  constructor(rawContext: RawContext, lookAhead: number) {
    this.rawContext = rawContext;
    this.lookAhead = lookAhead;
  }

  // Hardware output latency (speaker buffer). Zero when the browser does not
  // expose it (e.g. Firefox < 119).
  getOutputLatency(): number {
    return this.rawContext.outputLatency ?? 0;
  }

  // Platform base latency (OS audio subsystem overhead).
  getBaseLatency(): number {
    return this.rawContext.baseLatency ?? 0;
  }

  // Estimated input latency from microphone capture. Uses one render quantum
  // as a conservative lower bound per Web Audio API latency research.
  getInputLatency(): number {
    return RENDER_QUANTUM_FRAMES / this.rawContext.sampleRate;
  }

  // Tone.js scheduling look-ahead passed through AudioService configuration.
  getLookAhead(): number {
    return this.lookAhead;
  }

  // Total round-trip compensation in seconds: the sum of output latency,
  // base latency, scheduling look-ahead, and estimated input latency.
  getTotalCompensation(): number {
    return (
      this.getOutputLatency() +
      this.getBaseLatency() +
      this.getLookAhead() +
      this.getInputLatency()
    );
  }

  // Total compensation expressed as an integer sample count at the given
  // sample rate.
  compensationInSamples(sampleRate: number): number {
    return Math.floor(this.getTotalCompensation() * sampleRate);
  }

  // Trim leading latency samples from a recorded buffer. Returns the original
  // buffer unchanged when the compensation would remove all or no samples.
  trimBuffer(buffer: AudioBuffer, compensationSeconds: number): AudioBuffer {
    const samplesToTrim = Math.floor(compensationSeconds * buffer.sampleRate);
    if (samplesToTrim <= 0 || samplesToTrim >= buffer.length) return buffer;

    const newLength = buffer.length - samplesToTrim;
    const trimmed = new AudioBuffer({
      numberOfChannels: buffer.numberOfChannels,
      length: newLength,
      sampleRate: buffer.sampleRate,
    });

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const sourceData = buffer.getChannelData(ch);
      const destData = trimmed.getChannelData(ch);
      destData.set(sourceData.subarray(samplesToTrim));
    }

    return trimmed;
  }
}

export default LatencyCompensation;
