// InstrumentClassificationService — owns instrument classification state.
//
// Delegates inference to a Web Worker to keep the main thread responsive.
// The worker handles model loading (with stale-while-revalidate caching
// via the Cache API) and audio preprocessing. If the worker fails, the
// service falls back to main-thread inference.
//
// Uses Essentia.js WASM for mel spectrogram extraction and ONNX Runtime
// for Discogs-EffNet embedding + MTG-Jamendo instrument classification.
//
// Signal ownership and per-track caching remain on the main thread.

import { signal, type ReadonlySignal } from '@preact/signals-react';
import type { TrackId } from '../types/track';
import type { WorkerMessage, ClassifyResponse } from './classification.worker';
import {
  FALLBACK_LABEL,
  JAMENDO_CLASSES,
  mapToInstrumentLabel,
  type InstrumentLabel,
} from './instrumentLabels';
import { computeMelSpectrogram } from './melSpectrogram';
import { fetchModel } from './ModelCache';

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

// EffNet expects 16 kHz mono audio
const MODEL_SAMPLE_RATE = 16_000;

// Minimum audio duration (seconds) for one 128-frame mel spectrogram patch.
// At 16 kHz with frame=512 and hop=256: (128-1)*256 + 512 = 33,024 samples ≈ 2.07s.
// Rounded up to give a small margin.
const MIN_AUDIO_DURATION_SECONDS = 2.1;

// Duration of the loudest excerpt extracted before classification (seconds).
// Keeps inference fast while providing enough context (~2–3 patches).
const EXCERPT_DURATION_SECONDS = 5;

// Same-origin paths proxied to essentia.upf.edu (Vite proxy in dev,
// Netlify redirect in production) to avoid CORS restrictions.
const EFFNET_URL =
  '/models/feature-extractors/discogs-effnet/discogs-effnet-bsdynamic-1.onnx';
const INSTRUMENT_HEAD_URL =
  '/models/classification-heads/mtg_jamendo_instrument/mtg_jamendo_instrument-discogs-effnet-1.onnx';

// EffNet input dimensions
const PATCH_FRAMES = 128;
const MEL_BANDS = 96;

type AudioExcerpt = {
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
};

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

    const durationSeconds = audioBuffer.length / audioBuffer.sampleRate;
    if (durationSeconds < MIN_AUDIO_DURATION_SECONDS) {
      console.log(
        `[classification] Track ${trackId} too short (${durationSeconds.toFixed(1)}s) — skipping`,
      );
      const result: ClassificationResult = {
        label: FALLBACK_LABEL,
        score: 0,
      };
      this.setEntry(trackId, { state: 'done', result });
      return FALLBACK_LABEL;
    }

    const excerpt = extractLoudestExcerpt(
      audioBuffer,
      EXCERPT_DURATION_SECONDS,
    );

    this.setEntry(trackId, { state: 'classifying' });
    console.log(`[classification] Classifying track ${trackId}`);

    try {
      const rawResult = await this.runInference(excerpt);
      return this.applyResult(trackId, rawResult);
    } catch {
      this.setEntry(trackId, { state: 'error' });
      throw new Error(`Classification failed for track ${trackId}`);
    }
  }

  // --- Inference orchestration ---

  private async runInference(
    excerpt: AudioExcerpt,
  ): Promise<RawClassificationResult> {
    if (this.workerFailed) {
      return this.classifyOnMainThread(excerpt);
    }
    try {
      return await this.classifyInWorker(excerpt);
    } catch (workerError) {
      this.workerFailed = true;
      console.warn(
        '[classification] Worker failed, falling back to main thread:',
        workerError,
      );
      return this.classifyOnMainThread(excerpt);
    }
  }

  private applyResult(
    trackId: TrackId,
    rawResult: RawClassificationResult,
  ): string {
    const result: ClassificationResult = {
      label: mapToInstrumentLabel(rawResult.label),
      score: rawResult.score,
    };
    this.setEntry(trackId, { state: 'done', result });
    console.log(
      `[classification] Track ${trackId} classified as "${result.label}" (raw: "${rawResult.label}", score: ${result.score.toFixed(3)})`,
    );
    return result.label;
  }

  // --- Worker-based inference ---

  private classifyInWorker(
    excerpt: AudioExcerpt,
  ): Promise<{ label: string; score: number }> {
    const worker = this.getWorker();
    const id = this.nextMessageId++;

    const transferables: Transferable[] = [];
    const channelData: Float32Array[] = [];
    for (const channel of excerpt.channelData) {
      const copy = new Float32Array(channel);
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
          sampleRate: excerpt.sampleRate,
          length: excerpt.length,
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
    excerpt: AudioExcerpt,
  ): Promise<{ label: string; score: number }> {
    const classify = await this.loadClassifier();
    const monoSamples = downmixExcerptToMono(excerpt, MODEL_SAMPLE_RATE);
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
    console.log('[classification] Loading ONNX models on main thread...');
    const ort = await import('onnxruntime-web');
    ort.env.wasm.numThreads = 1;

    const [effnetBuffer, instrumentBuffer] = await Promise.all([
      fetchModel(EFFNET_URL),
      fetchModel(INSTRUMENT_HEAD_URL),
    ]);

    const [effnetSession, instrumentSession] = await Promise.all([
      ort.InferenceSession.create(effnetBuffer),
      ort.InferenceSession.create(instrumentBuffer),
    ]);

    console.log('[classification] Models loaded on main thread');

    return async (monoAudio: Float32Array) => {
      const patches = await computeMelSpectrogram(monoAudio);
      if (patches.length === 0) {
        throw new Error('Audio too short to produce mel spectrogram patches');
      }

      // Run EffNet on all patches
      const batchSize = patches.length;
      const inputData = new Float32Array(batchSize * PATCH_FRAMES * MEL_BANDS);
      for (let i = 0; i < batchSize; i++) {
        inputData.set(patches[i], i * PATCH_FRAMES * MEL_BANDS);
      }

      const effnetInput = new ort.Tensor('float32', inputData, [
        batchSize,
        PATCH_FRAMES,
        MEL_BANDS,
      ]);
      const effnetOutput = await effnetSession.run({
        model_input: effnetInput,
      });
      const embeddings = Object.values(effnetOutput)[0] as {
        data: Float32Array;
        dims: readonly number[];
      };

      // Average embeddings across patches
      const embeddingDim = embeddings.dims[1];
      const avgEmbedding = new Float32Array(embeddingDim);
      for (let p = 0; p < batchSize; p++) {
        for (let d = 0; d < embeddingDim; d++) {
          avgEmbedding[d] += embeddings.data[p * embeddingDim + d] / batchSize;
        }
      }

      // Run instrument classification head
      const instrumentInput = new ort.Tensor('float32', avgEmbedding, [
        1,
        embeddingDim,
      ]);
      const instrumentOutput = await instrumentSession.run({
        model_input: instrumentInput,
      });
      const predictions = Object.values(instrumentOutput)[0] as {
        data: Float32Array;
      };

      // Find top prediction
      let bestIndex = 0;
      let bestScore = -1;
      for (let i = 0; i < predictions.data.length; i++) {
        if (predictions.data[i] > bestScore) {
          bestScore = predictions.data[i];
          bestIndex = i;
        }
      }

      return {
        label: JAMENDO_CLASSES[bestIndex],
        score: bestScore,
      };
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

// --- Audio excerpt extraction ---

function extractLoudestExcerpt(
  audioBuffer: AudioBuffer,
  excerptSeconds: number,
): AudioExcerpt {
  const sampleRate = audioBuffer.sampleRate;
  const excerptSamples = Math.min(
    Math.round(excerptSeconds * sampleRate),
    audioBuffer.length,
  );

  // Audio is shorter than the excerpt duration — use full audio
  if (audioBuffer.length <= excerptSamples) {
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      channelData.push(new Float32Array(audioBuffer.getChannelData(ch)));
    }
    return { channelData, sampleRate, length: audioBuffer.length };
  }

  // Downmix to mono for energy calculation
  const mono = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < audioBuffer.length; i++) {
      mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }

  // Cumulative energy for O(1) window energy queries
  const cumEnergy = new Float64Array(audioBuffer.length + 1);
  for (let i = 0; i < audioBuffer.length; i++) {
    cumEnergy[i + 1] = cumEnergy[i] + mono[i] * mono[i];
  }

  // Slide a window in 100ms steps to find the loudest segment
  const step = Math.max(1, Math.round(sampleRate * 0.1));
  let bestStart = 0;
  let bestEnergy = -1;
  for (
    let start = 0;
    start <= audioBuffer.length - excerptSamples;
    start += step
  ) {
    const energy = cumEnergy[start + excerptSamples] - cumEnergy[start];
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = start;
    }
  }

  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    channelData.push(
      audioBuffer
        .getChannelData(ch)
        .slice(bestStart, bestStart + excerptSamples),
    );
  }
  return { channelData, sampleRate, length: excerptSamples };
}

// --- Audio utilities (main-thread fallback) ---

function downmixExcerptToMono(
  excerpt: AudioExcerpt,
  targetSampleRate: number,
): Float32Array {
  const {
    channelData,
    sampleRate: sourceSampleRate,
    length: sourceLength,
  } = excerpt;
  const numberOfChannels = channelData.length;

  const mono = new Float32Array(sourceLength);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    for (let i = 0; i < sourceLength; i++) {
      mono[i] += channelData[ch][i] / numberOfChannels;
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
