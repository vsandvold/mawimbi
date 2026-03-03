// RecordingProcessor — AudioWorkletProcessor that captures raw PCM
// Float32Array chunks on the audio thread.
//
// Runs inside an AudioWorklet scope, immune to main-thread jank.
// Communicates with the main-thread WorkletRecorder via MessagePort.
//
// Message protocol:
//   Main → Processor:  { type: 'start' }  — begin capturing
//   Main → Processor:  { type: 'stop' }   — stop and report sample count
//   Processor → Main:  { type: 'chunk', data: Float32Array }
//   Processor → Main:  { type: 'stopped', sampleCount: number }

export type ProcessorMessage =
  | { type: 'chunk'; data: Float32Array }
  | { type: 'stopped'; sampleCount: number };

export type ProcessorCommand = { type: 'start' } | { type: 'stop' };

class RecordingProcessor extends AudioWorkletProcessor {
  private capturing = false;
  private sampleCount = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<ProcessorCommand>) => {
      if (event.data.type === 'start') {
        this.capturing = true;
        this.sampleCount = 0;
      } else if (event.data.type === 'stop') {
        this.capturing = false;
        this.port.postMessage({
          type: 'stopped',
          sampleCount: this.sampleCount,
        } satisfies ProcessorMessage);
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.capturing) return true;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Capture the first channel (mono recording)
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    const chunk = new Float32Array(channelData.length);
    chunk.set(channelData);
    this.sampleCount += chunk.length;

    this.port.postMessage(
      { type: 'chunk', data: chunk } satisfies ProcessorMessage,
      [chunk.buffer],
    );

    return true;
  }
}

registerProcessor('recording-processor', RecordingProcessor);
