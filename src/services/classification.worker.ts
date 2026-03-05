// Classification worker — runs Transformers.js pipeline loading and
// inference off the main thread to keep the UI responsive.
//
// Uses the AST (Audio Spectrogram Transformer) model for audio
// classification into AudioSet labels. Label-to-instrument mapping
// happens on the main thread (InstrumentClassificationService).
//
// Implements stale-while-revalidate model caching:
// 1. If model files exist in Cache API, load from cache only (fast path)
// 2. After cache hit, revalidate cached files in the background
// 3. On cache miss, download from network (slow first load)
//
// Audio preprocessing (downmix + resample) also runs here to avoid
// blocking the main thread with CPU-intensive sample manipulation.

import { isModelCached, revalidateCache } from './ModelCache';

const MODEL_ID = 'Xenova/ast-finetuned-audioset-10-10-0.4593';
const TASK = 'audio-classification';

// AST model expects 16 kHz mono audio
const MODEL_SAMPLE_RATE = 16_000;

export type ClassifyRequest = {
  id: number;
  type: 'classify';
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
};

export type ClassifyResponse =
  | { id: number; type: 'result'; label: string; score: number }
  | { id: number; type: 'error'; message: string };

type Classifier = (
  audio: Float32Array,
) => Promise<{ label: string; score: number }>;

let classifier: Classifier | null = null;
let pipelinePromise: Promise<Classifier> | null = null;

async function loadPipeline(): Promise<Classifier> {
  if (classifier) return classifier;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = initializePipeline();
  classifier = await pipelinePromise;
  pipelinePromise = null;
  return classifier;
}

async function initializePipeline(): Promise<Classifier> {
  console.log('[classification:worker] Loading model pipeline...');
  const { pipeline, env } = await import('@huggingface/transformers');
  env.useBrowserCache = true;

  // Stale-while-revalidate: try cache-only first for fast startup
  const cached = await isModelCached(MODEL_ID);
  if (cached) {
    console.log('[classification:worker] Model found in cache, loading...');
    try {
      env.allowRemoteModels = false;
      const pipe = await pipeline(TASK, MODEL_ID, {
        device: 'wasm',
        dtype: 'q4',
      });

      // Cache hit — revalidate in background for next session
      env.allowRemoteModels = true;
      revalidateCache(MODEL_ID);

      console.log('[classification:worker] Model loaded from cache');
      return createClassifier(pipe);
    } catch {
      // Cache was stale or corrupt — fall through to network
      console.warn(
        '[classification:worker] Cache load failed, downloading from network...',
      );
      env.allowRemoteModels = true;
    }
  } else {
    console.log(
      '[classification:worker] No cached model, downloading from network...',
    );
  }

  // Network path (first load or cache miss)
  env.allowRemoteModels = true;
  const pipe = await pipeline(TASK, MODEL_ID, {
    device: 'wasm',
    dtype: 'q4',
  });
  console.log('[classification:worker] Model loaded from network');
  return createClassifier(pipe);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createClassifier(pipe: any): Classifier {
  return async (audio: Float32Array) => {
    const output = (await pipe(audio, { top_k: 1 })) as Array<{
      label: string;
      score: number;
    }>;
    return output[0];
  };
}

// --- Audio preprocessing ---

function downmixToMono(
  channelData: Float32Array[],
  sampleRate: number,
  length: number,
): Float32Array {
  const numberOfChannels = channelData.length;

  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[ch][i] / numberOfChannels;
    }
  }

  if (sampleRate === MODEL_SAMPLE_RATE) return mono;
  return resample(mono, sampleRate, MODEL_SAMPLE_RATE);
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

// --- Worker message handler ---

type WorkerSelf = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

const workerSelf = self as unknown as WorkerSelf;

workerSelf.onmessage = async (event: MessageEvent<ClassifyRequest>) => {
  const { id, channelData, sampleRate, length } = event.data;

  try {
    const classify = await loadPipeline();
    const monoSamples = downmixToMono(channelData, sampleRate, length);
    const result = await classify(monoSamples);

    const response: ClassifyResponse = {
      id,
      type: 'result',
      label: result.label,
      score: result.score,
    };
    workerSelf.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: ClassifyResponse = { id, type: 'error', message };
    workerSelf.postMessage(response);
  }
};
