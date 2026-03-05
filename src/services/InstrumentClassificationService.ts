// InstrumentClassificationService — owns instrument classification state.
//
// Delegates inference to a Web Worker to keep the main thread responsive.
// The worker handles pipeline loading (with stale-while-revalidate model
// caching via the Cache API) and audio preprocessing. If the worker fails,
// the service falls back to main-thread inference.
//
// Signal ownership and per-track caching remain on the main thread.

import { signal, type ReadonlySignal } from '@preact/signals-react';
import type { TrackId } from '../types/track';
import { type ClassifyResponse } from './classification.worker';

export type ClassificationState = 'idle' | 'classifying' | 'done' | 'error';

export type ClassificationResult = {
  label: string;
  score: number;
};

type ClassificationEntry = {
  state: ClassificationState;
  result?: ClassificationResult;
};

export type InstrumentLabel = (typeof CANDIDATE_LABELS)[number];

const CANDIDATE_LABELS = [
  'vocals',
  'guitar',
  'bass',
  'drums',
  'keyboard',
  'strings',
  'brass',
  'woodwind',
  'synth',
  'percussion',
] as const;

// Sample rate expected by the CLAP model
const MODEL_SAMPLE_RATE = 48_000;

type Pipeline = (
  audio: Float32Array,
  labels: string[],
) => Promise<Array<{ label: string; score: number }>>;

type PendingRequest = {
  resolve: (result: ClassificationResult) => void;
  reject: (error: Error) => void;
};

class InstrumentClassificationService {
  // --- Private signals (only the service writes these) ---

  private readonly _classifications = signal<
    ReadonlyMap<TrackId, ClassificationEntry>
  >(new Map());

  // --- Narrow channel for reactive consumers (hooks) ---

  readonly signals: {
    readonly classifications: ReadonlySignal<
      ReadonlyMap<TrackId, ClassificationEntry>
    >;
  };

  private cache = new Map<TrackId, ClassificationEntry>();
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextMessageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();

  // Main-thread fallback state
  private pipeline: Pipeline | null = null;
  private pipelinePromise: Promise<Pipeline> | null = null;

  constructor() {
    this.signals = {
      classifications: this._classifications,
    };
  }

  // --- Plain getters for non-reactive consumers (tests, workflows) ---

  get classifications(): ReadonlyMap<TrackId, ClassificationEntry> {
    return this._classifications.value;
  }

  getClassification(trackId: TrackId): ClassificationResult | undefined {
    return this.cache.get(trackId)?.result;
  }

  getClassificationState(trackId: TrackId): ClassificationState {
    return this.cache.get(trackId)?.state ?? 'idle';
  }

  // --- Classification ---

  async classify(trackId: TrackId, audioBuffer: AudioBuffer): Promise<string> {
    if (this.cache.has(trackId)) {
      const cached = this.cache.get(trackId)!;
      if (cached.state === 'done' && cached.result) {
        return cached.result.label;
      }
    }

    this.setEntry(trackId, { state: 'classifying' });

    try {
      const result = this.workerFailed
        ? await this.classifyOnMainThread(audioBuffer)
        : await this.classifyInWorker(audioBuffer);

      this.setEntry(trackId, { state: 'done', result });
      return result.label;
    } catch {
      // If the worker failed for the first time, try the main-thread fallback
      if (!this.workerFailed) {
        this.workerFailed = true;
        try {
          const result = await this.classifyOnMainThread(audioBuffer);
          this.setEntry(trackId, { state: 'done', result });
          return result.label;
        } catch {
          // Main thread also failed — fall through to error
        }
      }
      this.setEntry(trackId, { state: 'error' });
      throw new Error(`Classification failed for track ${trackId}`);
    }
  }

  // --- Worker-based inference ---

  private classifyInWorker(
    audioBuffer: AudioBuffer,
  ): Promise<ClassificationResult> {
    const worker = this.getWorker();
    const id = this.nextMessageId++;

    const channelData: Float32Array[] = [];
    const transferables: Transferable[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const copy = new Float32Array(audioBuffer.getChannelData(ch));
      channelData.push(copy);
      transferables.push(copy.buffer);
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      worker.postMessage(
        {
          id,
          type: 'classify',
          channelData,
          sampleRate: audioBuffer.sampleRate,
          length: audioBuffer.length,
        },
        transferables,
      );
    });
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./classification.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (event: MessageEvent<ClassifyResponse>) => {
        const { id, type } = event.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;
        this.pendingRequests.delete(id);

        if (type === 'error') {
          pending.reject(new Error(event.data.message));
        } else {
          pending.resolve({
            label: event.data.label,
            score: event.data.score,
          });
        }
      };
      this.worker.onerror = () => {
        this.workerFailed = true;
        this.rejectAllPending(
          new Error(
            'Classification worker failed; falling back to main thread',
          ),
        );
      };
    }
    return this.worker;
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  // --- Main-thread fallback ---

  private async classifyOnMainThread(
    audioBuffer: AudioBuffer,
  ): Promise<ClassificationResult> {
    const classifierPipeline = await this.loadPipeline();
    const monoSamples = downmixToMono(audioBuffer, MODEL_SAMPLE_RATE);
    const results = await classifierPipeline(monoSamples, [
      ...CANDIDATE_LABELS,
    ]);

    const top = results.reduce((best, current) =>
      current.score > best.score ? current : best,
    );

    return { label: top.label, score: top.score };
  }

  private async loadPipeline(): Promise<Pipeline> {
    if (this.pipeline) return this.pipeline;
    if (this.pipelinePromise) return this.pipelinePromise;

    this.pipelinePromise = this.initializePipeline();
    this.pipeline = await this.pipelinePromise;
    this.pipelinePromise = null;
    return this.pipeline;
  }

  private async initializePipeline(): Promise<Pipeline> {
    const { pipeline } = await import('@huggingface/transformers');

    const classifier = await pipeline(
      'zero-shot-audio-classification',
      'Xenova/clap-large',
      { device: 'wasm' },
    );

    return async (audio: Float32Array, labels: string[]) => {
      const output = await classifier(audio, labels);

      return output as Array<{ label: string; score: number }>;
    };
  }

  // --- Cleanup ---

  removeClassification(trackId: TrackId): void {
    this.cache.delete(trackId);
    this.publishCache();
  }

  reset(): void {
    this.cache.clear();
    this.publishCache();
  }

  // --- Internal state management ---

  private setEntry(trackId: TrackId, entry: ClassificationEntry): void {
    this.cache.set(trackId, entry);
    this.publishCache();
  }

  private publishCache(): void {
    this._classifications.value = new Map(this.cache);
  }
}

// --- Audio utilities (main-thread fallback) ---

function downmixToMono(
  audioBuffer: AudioBuffer,
  targetSampleRate: number,
): Float32Array {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sourceSampleRate = audioBuffer.sampleRate;
  const sourceLength = audioBuffer.length;

  const mono = new Float32Array(sourceLength);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < sourceLength; i++) {
      mono[i] += channelData[i] / numberOfChannels;
    }
  }

  if (sourceSampleRate === targetSampleRate) {
    return mono;
  }

  return resample(mono, sourceSampleRate, targetSampleRate);
}

function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  const ratio = fromRate / toRate;
  const outputLength = Math.round(samples.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const fraction = srcIndex - srcIndexFloor;

    const sample0 = samples[srcIndexFloor] ?? 0;
    const sample1 = samples[srcIndexFloor + 1] ?? 0;
    output[i] = sample0 + fraction * (sample1 - sample0);
  }

  return output;
}

export default InstrumentClassificationService;
