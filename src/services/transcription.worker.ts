// Transcription worker — runs Whisper speech-to-text inference off the main
// thread using @huggingface/transformers.
//
// Pipeline: mono 16 kHz audio → Whisper (automatic-speech-recognition)
//   → segments with word-level timestamps
//
// Model files are cached by transformers.js in the Cache API.
// Download progress is reported back to the main thread.

import type {
  TranscriptionSegment,
  TranscriptionWord,
} from '../types/transcription';

// Whisper expects 16 kHz mono audio
const MODEL_SAMPLE_RATE = 16_000;

// Use whisper-base for the balance of quality and download size (~142 MB)
const MODEL_ID = 'onnx-community/whisper-base';

export type TranscribeRequest = {
  id: number;
  type: 'transcribe';
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
};

export type TranscribeResponse =
  | {
      id: number;
      type: 'result';
      language: string;
      segments: TranscriptionSegment[];
    }
  | { id: number; type: 'error'; message: string };

export type DownloadProgressMessage = {
  type: 'download-progress';
  progress: number;
};

export type WorkerLogMessage = {
  type: 'log';
  level: 'log' | 'warn' | 'error' | 'debug';
  message: string;
};

export type WorkerMessage =
  | TranscribeResponse
  | DownloadProgressMessage
  | WorkerLogMessage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pipeline = any;

let pipeline: Pipeline | null = null;
let pipelinePromise: Promise<Pipeline> | null = null;

async function loadPipeline(): Promise<Pipeline> {
  if (pipeline) return pipeline;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = initializePipeline();
  pipeline = await pipelinePromise;
  pipelinePromise = null;
  return pipeline;
}

// --- Download progress tracking ---

// Tracks per-file download progress to compute an overall percentage.
const fileProgress = new Map<string, number>();

function reportProgress(file: string, loaded: number, total: number): void {
  const percentage = Math.round((loaded / total) * 100);
  fileProgress.set(file, percentage);

  let sum = 0;
  for (const p of fileProgress.values()) sum += p;
  const overall = Math.round(sum / fileProgress.size);

  workerSelf.postMessage({
    type: 'download-progress',
    progress: overall,
  } satisfies DownloadProgressMessage);
}

async function initializePipeline(): Promise<Pipeline> {
  workerLog('log', '[transcription:worker] Loading Whisper model...');

  const { pipeline: createPipeline, env } =
    await import('@huggingface/transformers');

  // Allow local model loading and configure cache
  env.allowLocalModels = false;

  const transcriber = await createPipeline(
    'automatic-speech-recognition',
    MODEL_ID,
    {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (progress: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (
          progress.status === 'progress' &&
          progress.file &&
          progress.loaded != null &&
          progress.total != null
        ) {
          reportProgress(progress.file, progress.loaded, progress.total);
        }
      },
    },
  );

  workerLog('log', '[transcription:worker] Whisper model loaded');
  return transcriber;
}

// --- Transcription ---

type WhisperChunk = {
  text: string;
  timestamp: [number, number | null];
};

async function transcribe(
  transcriber: Pipeline,
  audio: Float32Array,
): Promise<{ language: string; segments: TranscriptionSegment[] }> {
  const durationSeconds = audio.length / MODEL_SAMPLE_RATE;
  workerLog(
    'debug',
    `[transcription:worker] Transcribing ${audio.length} samples (${durationSeconds.toFixed(2)}s)...`,
  );

  const result = await transcriber(audio, {
    return_timestamps: 'word',
    language: null, // auto-detect
  });

  workerLog(
    'debug',
    `[transcription:worker] Raw result: ${JSON.stringify(result).slice(0, 500)}`,
  );

  const language = result.language ?? 'en';
  const chunks: WhisperChunk[] = result.chunks ?? [];

  const segments = groupWordsIntoSegments(chunks);

  workerLog(
    'log',
    `[transcription:worker] Transcription complete: ${segments.length} segments, ${chunks.length} words, language="${language}"`,
  );

  return { language, segments };
}

// --- Segment grouping ---

// Groups word-level chunks into segments by detecting pauses between words.
// A new segment starts when the gap between consecutive words exceeds the threshold.
const SEGMENT_GAP_THRESHOLD_SECONDS = 1.0;

function groupWordsIntoSegments(
  chunks: WhisperChunk[],
): TranscriptionSegment[] {
  if (chunks.length === 0) return [];

  const segments: TranscriptionSegment[] = [];
  let currentWords: TranscriptionWord[] = [];

  for (const chunk of chunks) {
    const word: TranscriptionWord = {
      text: chunk.text.trim(),
      start: chunk.timestamp[0],
      end: chunk.timestamp[1] ?? chunk.timestamp[0],
    };

    if (word.text === '') continue;

    if (currentWords.length > 0) {
      const lastWord = currentWords[currentWords.length - 1];
      const gap = word.start - lastWord.end;

      if (gap >= SEGMENT_GAP_THRESHOLD_SECONDS) {
        segments.push(buildSegment(currentWords));
        currentWords = [];
      }
    }

    currentWords.push(word);
  }

  if (currentWords.length > 0) {
    segments.push(buildSegment(currentWords));
  }

  return segments;
}

function buildSegment(words: TranscriptionWord[]): TranscriptionSegment {
  return {
    text: words.map((w) => w.text).join(' '),
    start: words[0].start,
    end: words[words.length - 1].end,
    words,
  };
}

// --- Audio preprocessing ---

function downmixToMono(
  channelData: Float32Array[],
  length: number,
): Float32Array {
  const numberOfChannels = channelData.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[ch][i] / numberOfChannels;
    }
  }
  return mono;
}

function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIndex - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }

  return output;
}

// --- Worker message handler ---

type WorkerSelf = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

const workerSelf = self as unknown as WorkerSelf;

function workerLog(level: WorkerLogMessage['level'], message: string): void {
  workerSelf.postMessage({
    type: 'log',
    level,
    message,
  } satisfies WorkerLogMessage);
}

workerSelf.onmessage = async (event: MessageEvent<TranscribeRequest>) => {
  const { id, channelData, sampleRate, length } = event.data;

  const channels = channelData.length;
  const durationSeconds = length / sampleRate;
  workerLog(
    'debug',
    `[transcription:worker] Received audio: ${channels}ch, ${length} samples, ${sampleRate} Hz, ${durationSeconds.toFixed(2)}s`,
  );

  if (length === 0 || channelData[0]?.length === 0) {
    const response: TranscribeResponse = {
      id,
      type: 'error',
      message: 'Worker received empty audio data',
    };
    workerSelf.postMessage(response);
    return;
  }

  try {
    const transcriber = await loadPipeline();

    const mono = downmixToMono(channelData, length);
    const resampled = resampleLinear(mono, sampleRate, MODEL_SAMPLE_RATE);

    workerLog(
      'debug',
      `[transcription:worker] Preprocessed audio: ${resampled.length} samples at ${MODEL_SAMPLE_RATE} Hz`,
    );

    const result = await transcribe(transcriber, resampled);

    const response: TranscribeResponse = {
      id,
      type: 'result',
      language: result.language,
      segments: result.segments,
    };
    workerSelf.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLog(
      'error',
      `[transcription:worker] Transcription failed: ${message}`,
    );
    const response: TranscribeResponse = { id, type: 'error', message };
    workerSelf.postMessage(response);
  }
};
