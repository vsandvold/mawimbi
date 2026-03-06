// Classification worker — runs Essentia.js mel spectrogram extraction and
// ONNX Runtime inference off the main thread to keep the UI responsive.
//
// Pipeline: mono 16 kHz audio → mel spectrogram (essentia.js WASM)
//   → Discogs-EffNet embeddings (ONNX) → MTG-Jamendo instrument head (ONNX)
//   → top instrument prediction
//
// Model files are cached via the Cache API with stale-while-revalidate.
// Download progress is reported back to the main thread.

import { computeMelSpectrogram } from './melSpectrogram';
import { JAMENDO_CLASSES } from './instrumentLabels';
import { fetchModel, isModelCached } from './ModelCache';

// Same-origin paths proxied to essentia.upf.edu (Vite proxy in dev,
// Netlify redirect in production) to avoid CORS restrictions.
const EFFNET_URL =
  '/models/feature-extractors/discogs-effnet/discogs-effnet-bsdynamic-1.onnx';
const INSTRUMENT_HEAD_URL =
  '/models/classification-heads/mtg_jamendo_instrument/mtg_jamendo_instrument-discogs-effnet-1.onnx';

// EffNet expects 16 kHz mono audio
const MODEL_SAMPLE_RATE = 16_000;

// EffNet input: [batch, 128 frames, 96 mel bands]
const PATCH_FRAMES = 128;
const MEL_BANDS = 96;

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

export type DownloadProgressMessage = {
  type: 'download-progress';
  progress: number;
};

export type WorkerMessage = ClassifyResponse | DownloadProgressMessage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OnnxSession = any;

type InferenceContext = {
  effnetSession: OnnxSession;
  instrumentSession: OnnxSession;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ort: any;
};

let context: InferenceContext | null = null;
let contextPromise: Promise<InferenceContext> | null = null;

async function loadContext(): Promise<InferenceContext> {
  if (context) return context;
  if (contextPromise) return contextPromise;

  contextPromise = initializeContext();
  context = await contextPromise;
  contextPromise = null;
  return context;
}

// --- Download progress tracking ---

// Tracks per-model download progress to compute an overall percentage.
// Each model reports bytes loaded vs total; the overall progress is the
// average percentage across both models.
const modelProgress = new Map<string, number>();

function reportProgress(url: string, loaded: number, total: number): void {
  const percentage = Math.round((loaded / total) * 100);
  modelProgress.set(url, percentage);

  let sum = 0;
  for (const p of modelProgress.values()) sum += p;
  const overall = Math.round(sum / modelProgress.size);

  workerSelf.postMessage({
    type: 'download-progress',
    progress: overall,
  } satisfies DownloadProgressMessage);
}

async function initializeContext(): Promise<InferenceContext> {
  console.log('[classification:worker] Loading ONNX models...');
  const ort = await import('onnxruntime-web');

  // Disable multithreading to avoid SharedArrayBuffer requirement
  ort.env.wasm.numThreads = 1;

  const [effnetCached, instrumentCached] = await Promise.all([
    isModelCached(EFFNET_URL),
    isModelCached(INSTRUMENT_HEAD_URL),
  ]);
  const allCached = effnetCached && instrumentCached;

  if (allCached) {
    console.log('[classification:worker] Models found in cache, loading...');
  } else {
    console.log('[classification:worker] Downloading models from network...');
  }

  const onEffnetProgress = allCached
    ? undefined
    : (loaded: number, total: number) =>
        reportProgress(EFFNET_URL, loaded, total);
  const onInstrumentProgress = allCached
    ? undefined
    : (loaded: number, total: number) =>
        reportProgress(INSTRUMENT_HEAD_URL, loaded, total);

  const [effnetBuffer, instrumentBuffer] = await Promise.all([
    fetchModel(EFFNET_URL, onEffnetProgress),
    fetchModel(INSTRUMENT_HEAD_URL, onInstrumentProgress),
  ]);

  const [effnetSession, instrumentSession] = await Promise.all([
    ort.InferenceSession.create(effnetBuffer),
    ort.InferenceSession.create(instrumentBuffer),
  ]);

  console.log('[classification:worker] Models loaded');
  return { effnetSession, instrumentSession, ort };
}

// --- Inference ---

async function classify(
  ctx: InferenceContext,
  monoAudio: Float32Array,
): Promise<{ label: string; score: number }> {
  const { effnetSession, instrumentSession, ort } = ctx;

  // Compute mel spectrogram patches
  const patches = await computeMelSpectrogram(monoAudio);
  if (patches.length === 0) {
    throw new Error('Audio too short to produce mel spectrogram patches');
  }

  // Run EffNet on each patch to get 1280-dim embeddings
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
    dims: number[];
  };

  // Average embeddings across patches → [1, 1280]
  const embeddingDim = embeddings.dims[1];
  const avgEmbedding = new Float32Array(embeddingDim);
  for (let p = 0; p < batchSize; p++) {
    for (let d = 0; d < embeddingDim; d++) {
      avgEmbedding[d] += embeddings.data[p * embeddingDim + d] / batchSize;
    }
  }

  // Run instrument classification head → 40 sigmoid predictions
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
    const ctx = await loadContext();
    const monoSamples = downmixToMono(channelData, sampleRate, length);
    const result = await classify(ctx, monoSamples);

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
