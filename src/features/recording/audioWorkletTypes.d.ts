// Type declarations for AudioWorklet scope APIs that TypeScript's DOM lib
// does not expose to the main-thread scope. These types are used by
// RecordingProcessor.ts and AnalysisProcessor.ts which run inside an
// AudioWorklet.

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;
