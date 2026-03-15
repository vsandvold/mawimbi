// WorkletRecorder — main-thread wrapper for the RecordingProcessor
// AudioWorklet.
//
// Loads the worklet module, creates the AudioWorkletNode, and accumulates
// PCM chunks posted from the audio thread. On stop, merges chunks into a
// single AudioBuffer — no MediaRecorder encoding delay, no variable chunk
// timing, and sample-accurate start/stop timestamps.
//
// Uses the native browser AudioContext directly (not the standardized-audio-
// context wrapper used by Tone.js). This avoids the node registry lookup
// error that occurs when connecting standardized-audio-context AudioWorklet
// nodes. See https://github.com/Tonejs/Tone.js/issues/712.

import { type ProcessorMessage } from './RecordingProcessor';

const PROCESSOR_NAME = 'recording-processor';
const CHANNEL_COUNT = 1;

class WorkletRecorder {
  private audioContext: AudioContext;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private recording = false;
  private initialized = false;
  private onStopped: ((buffer: AudioBuffer) => void) | null = null;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  // Load the worklet module. Must be called once before start(). Subsequent
  // calls are no-ops.
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const moduleUrl = new URL('./RecordingProcessor.ts', import.meta.url);
    await this.audioContext.audioWorklet.addModule(moduleUrl);
    this.initialized = true;
  }

  // Returns the AudioWorkletNode so the caller can connect a source to it
  // (e.g., microphone → worklet node).
  get input(): AudioWorkletNode {
    if (!this.node) {
      this.node = new AudioWorkletNode(this.audioContext, PROCESSOR_NAME, {
        channelCount: CHANNEL_COUNT,
      });
      this.setupMessageHandler(this.node);
      // Connect to destination so process() is called on the audio thread.
      // The processor captures input only and outputs silence, so this is
      // inaudible.
      this.node.connect(this.audioContext.destination);
    }
    return this.node;
  }

  get state(): 'started' | 'stopped' {
    return this.recording ? 'started' : 'stopped';
  }

  get sampleRate(): number {
    return this.audioContext.sampleRate;
  }

  start(): void {
    this.chunks = [];
    this.recording = true;
    // Lazily create the node on first access via .input
    this.ensureNode();
    this.node!.port.postMessage({ type: 'start' });
  }

  // Sends a stop command to the processor and resolves with the merged
  // AudioBuffer once the processor acknowledges the stop.
  stop(): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      if (!this.node || !this.recording) {
        reject(new Error('WorkletRecorder is not recording'));
        return;
      }

      this.onStopped = (buffer: AudioBuffer) => resolve(buffer);
      this.node.port.postMessage({ type: 'stop' });
    });
  }

  dispose(): void {
    this.node?.disconnect();
    this.node = null;
    this.chunks = [];
    this.recording = false;
    this.onStopped = null;
  }

  private ensureNode(): void {
    // Accessing .input will create the node if needed
    void this.input;
  }

  private setupMessageHandler(node: AudioWorkletNode): void {
    node.port.onmessage = (event: MessageEvent<ProcessorMessage>) => {
      if (event.data.type === 'chunk') {
        this.chunks.push(event.data.data);
      } else if (event.data.type === 'stopped') {
        this.recording = false;
        const buffer = this.mergeChunks();
        if (this.onStopped) {
          this.onStopped(buffer);
          this.onStopped = null;
        }
      }
    };
  }

  private mergeChunks(): AudioBuffer {
    const totalLength = this.chunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );

    const buffer = new AudioBuffer({
      numberOfChannels: CHANNEL_COUNT,
      length: Math.max(totalLength, 1),
      sampleRate: this.sampleRate,
    });

    const channelData = buffer.getChannelData(0);
    let offset = 0;
    for (const chunk of this.chunks) {
      channelData.set(chunk, offset);
      offset += chunk.length;
    }

    this.chunks = [];
    return buffer;
  }
}

export default WorkletRecorder;
