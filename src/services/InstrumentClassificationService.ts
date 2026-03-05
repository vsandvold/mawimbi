// InstrumentClassificationService — owns instrument classification state.
//
// Delegates inference to a Web Worker to keep the main thread responsive.
// The worker handles pipeline loading (with stale-while-revalidate model
// caching via the Cache API) and audio preprocessing. If the worker fails,
// the service falls back to main-thread inference.
//
// Uses the CLAP (Contrastive Language-Audio Pretraining) model for
// zero-shot audio classification. Candidate labels match the app's
// instrument categories directly — no AudioSet label mapping needed.
//
// Signal ownership and per-track caching remain on the main thread.

import { signal, type ReadonlySignal } from '@preact/signals-react';
import type { TrackId } from '../types/track';
import {
  type WorkerMessage,
  type ClassifyResponse,
} from './classification.worker';
import {
  CANDIDATE_LABELS,
  mapToInstrumentLabel,
  type InstrumentLabel,
} from './instrumentLabels';

export type ClassificationState = 'idle' | 'classifying' | 'done' | 'error';

export type ClassificationResult = {
  label: InstrumentLabel;
  score: number;
};

type ClassificationEntry = {
  state: ClassificationState;
  result?: ClassificationResult;
};

export type { InstrumentLabel };

// CLAP model expects 48 kHz mono audio
const MODEL_SAMPLE_RATE = 48_000;

type Classifier = (
  audio: Float32Array,
) => Promise<{ label: string; score: number }>;

type RawClassificationResult = {
  label: string;
  score: number;
};

type PendingRequest = {
  resolve: (result: RawClassificationResult) => void;
  reject: (error: Error) => void;
};

class InstrumentClassificationService {
  // --- Private signals (only the service writes these) ---

  private readonly _classifications = signal<
    ReadonlyMap<TrackId, ClassificationEntry>
  >(new Map());

  private readonly _downloadProgress = signal<number | null>(null);

  // --- Narrow channel for reactive consumers (hooks) ---

  readonly signals: {
    readonly classifications: ReadonlySignal<
      ReadonlyMap<TrackId, ClassificationEntry>
    >;
    readonly downloadProgress: ReadonlySignal<number | null>;
  };

  private cache = new Map<TrackId, ClassificationEntry>();
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextMessageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();

  // Main-thread fallback state
  private classifier: Classifier | null = null;
  private classifierPromise: Promise<Classifier> | null = null;

  constructor() {
    this.signals = {
      classifications: this._classifications,
      downloadProgress: this._downloadProgress,
    };
  }

  // --- Plain getters for non-reactive consumers (tests, workflows) ---

  get classifications(): ReadonlyMap<TrackId, ClassificationEntry> {
    return this._classifications.value;
  }

  get downloadProgress(): number | null {
    return this._downloadProgress.value;
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
    console.log(`[classification] Classifying track ${trackId}`);

    try {
      const rawResult = this.workerFailed
        ? await this.classifyOnMainThread(audioBuffer)
        : await this.classifyInWorker(audioBuffer);

      const result: ClassificationResult = {
        label: mapToInstrumentLabel(rawResult.label),
        score: rawResult.score,
      };

      this.setEntry(trackId, { state: 'done', result });
      console.log(
        `[classification] Track ${trackId} classified as "${result.label}" (raw: "${rawResult.label}", score: ${result.score.toFixed(3)})`,
      );
      return result.label;
    } catch (workerError) {
      // If the worker failed for the first time, try the main-thread fallback
      if (!this.workerFailed) {
        this.workerFailed = true;
        console.warn(
          '[classification] Worker failed, falling back to main thread:',
          workerError,
        );
        try {
          const rawResult = await this.classifyOnMainThread(audioBuffer);
          const result: ClassificationResult = {
            label: mapToInstrumentLabel(rawResult.label),
            score: rawResult.score,
          };
          this.setEntry(trackId, { state: 'done', result });
          console.log(
            `[classification] Track ${trackId} classified as "${result.label}" (raw: "${rawResult.label}", score: ${result.score.toFixed(3)})`,
          );
          return result.label;
        } catch (mainThreadError) {
          console.error(
            '[classification] Main-thread fallback also failed:',
            mainThreadError,
          );
        }
      }
      this.setEntry(trackId, { state: 'error' });
      throw new Error(`Classification failed for track ${trackId}`);
    }
  }

  // --- Worker-based inference ---

  private classifyInWorker(
    audioBuffer: AudioBuffer,
  ): Promise<{ label: string; score: number }> {
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
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { type } = event.data;

        // Handle download progress updates (service-level, not per-request)
        if (type === 'download-progress') {
          this._downloadProgress.value = event.data.progress;
          return;
        }

        const response = event.data as ClassifyResponse;
        const pending = this.pendingRequests.get(response.id);
        if (!pending) return;
        this.pendingRequests.delete(response.id);

        // Model is loaded — clear download progress
        this._downloadProgress.value = null;

        if (response.type === 'error') {
          pending.reject(new Error(response.message));
        } else {
          pending.resolve({
            label: response.label,
            score: response.score,
          });
        }
      };
      this.worker.onerror = () => {
        this.workerFailed = true;
        this._downloadProgress.value = null;
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
  ): Promise<{ label: string; score: number }> {
    const classify = await this.loadClassifier();
    const monoSamples = downmixToMono(audioBuffer, MODEL_SAMPLE_RATE);
    return classify(monoSamples);
  }

  private async loadClassifier(): Promise<Classifier> {
    if (this.classifier) return this.classifier;
    if (this.classifierPromise) return this.classifierPromise;

    this.classifierPromise = this.initializeClassifier();
    this.classifier = await this.classifierPromise;
    this.classifierPromise = null;
    return this.classifier;
  }

  private async initializeClassifier(): Promise<Classifier> {
    console.log('[classification] Loading model on main thread...');
    const { pipeline } = await import('@huggingface/transformers');

    const pipe = await pipeline(
      'zero-shot-audio-classification',
      'Xenova/clap-htsat-unfused',
      { device: 'wasm', dtype: 'q8' },
    );
    console.log('[classification] Model loaded on main thread');

    return async (audio: Float32Array) => {
      const output = (await pipe(audio, CANDIDATE_LABELS)) as Array<{
        label: string;
        score: number;
      }>;
      return output[0];
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
