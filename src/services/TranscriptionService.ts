// TranscriptionService — owns speech-to-text transcription state.
//
// Delegates Whisper inference to a Web Worker to keep the main thread
// responsive. The worker loads the Whisper model via @huggingface/transformers
// (ONNX-based, WASM backend) and returns word-level and segment-level
// timestamps.
//
// Signal ownership and per-track caching remain on the main thread.

import { signal, type ReadonlySignal } from '@preact/signals-react';
import type { TrackId } from '../types/track';
import type {
  Transcription,
  TranscriptionSegment,
  TranscriptionWord,
} from '../types/transcription';
import type { WorkerMessage, TranscribeResponse } from './transcription.worker';

export type TranscriptionState = 'idle' | 'transcribing' | 'done' | 'error';

// Default Whisper model — matches the worker default.
const DEFAULT_MODEL_ID = 'onnx-community/whisper-base_timestamped';

type TranscriptionEntry = {
  state: TranscriptionState;
  result?: Transcription;
};

type RawTranscriptionResult = {
  language: string;
  segments: TranscriptionSegment[];
};

type PendingRequest = {
  resolve: (result: RawTranscriptionResult) => void;
  reject: (error: Error) => void;
};

class TranscriptionService {
  // --- Private signals (only the service writes these) ---

  private readonly _transcriptions = signal<
    ReadonlyMap<TrackId, TranscriptionEntry>
  >(new Map());

  private readonly _downloadProgress = signal<number | null>(null);

  // --- Narrow channel for reactive consumers (hooks) ---

  readonly signals: {
    readonly transcriptions: ReadonlySignal<
      ReadonlyMap<TrackId, TranscriptionEntry>
    >;
    readonly downloadProgress: ReadonlySignal<number | null>;
  };

  private cache = new Map<TrackId, TranscriptionEntry>();
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextMessageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();

  // Main-thread fallback state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mainThreadPipeline: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mainThreadPipelinePromise: Promise<any> | null = null;

  readonly modelId: string;

  constructor(modelId: string = DEFAULT_MODEL_ID) {
    this.modelId = modelId;
    this.signals = {
      transcriptions: this._transcriptions,
      downloadProgress: this._downloadProgress,
    };
  }

  // --- Plain getters for non-reactive consumers (tests, workflows) ---

  get transcriptions(): ReadonlyMap<TrackId, TranscriptionEntry> {
    return this._transcriptions.value;
  }

  get downloadProgress(): number | null {
    return this._downloadProgress.value;
  }

  getTranscription(trackId: TrackId): Transcription | undefined {
    return this.cache.get(trackId)?.result;
  }

  getTranscriptionState(trackId: TrackId): TranscriptionState {
    return this.cache.get(trackId)?.state ?? 'idle';
  }

  // --- Transcription ---

  async transcribe(
    trackId: TrackId,
    audioBuffer: AudioBuffer,
  ): Promise<Transcription> {
    const cached = this.cache.get(trackId);
    if (cached?.state === 'done' && cached.result) {
      console.debug(
        `[transcription] Track ${trackId} already transcribed (cached)`,
      );
      return cached.result;
    }

    const durationSeconds = audioBuffer.length / audioBuffer.sampleRate;
    console.debug(
      `[transcription] Track ${trackId}: ${audioBuffer.numberOfChannels}ch, ${audioBuffer.length} samples, ${audioBuffer.sampleRate} Hz, ${durationSeconds.toFixed(2)}s`,
    );

    this.setEntry(trackId, { state: 'transcribing' });
    console.log(`[transcription] Transcribing track ${trackId}`);

    try {
      const rawResult = await this.runInference(audioBuffer);
      return this.applyResult(trackId, rawResult);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(
        `[transcription] Transcription failed for track ${trackId}: ${detail}`,
      );
      this.setEntry(trackId, { state: 'error' });
      throw new Error(`Transcription failed for track ${trackId}: ${detail}`);
    }
  }

  // --- Inference orchestration ---

  private async runInference(
    audioBuffer: AudioBuffer,
  ): Promise<RawTranscriptionResult> {
    if (this.workerFailed) {
      console.debug(
        '[transcription] Using main-thread inference (worker previously failed)',
      );
      return this.transcribeOnMainThread(audioBuffer);
    }
    try {
      return await this.transcribeInWorker(audioBuffer);
    } catch (workerError) {
      this.workerFailed = true;
      const errorDetail =
        workerError instanceof Error
          ? workerError.message
          : String(workerError);
      console.warn(
        `[transcription] Worker failed, falling back to main thread: ${errorDetail}`,
      );
      return this.transcribeOnMainThread(audioBuffer);
    }
  }

  private applyResult(
    trackId: TrackId,
    rawResult: RawTranscriptionResult,
  ): Transcription {
    const transcription: Transcription = {
      trackId,
      language: rawResult.language,
      segments: rawResult.segments,
    };
    this.setEntry(trackId, { state: 'done', result: transcription });
    console.log(
      `[transcription] Track ${trackId} transcribed: ${transcription.segments.length} segments, language="${transcription.language}"`,
    );
    return transcription;
  }

  // --- Worker-based inference ---

  private transcribeInWorker(
    audioBuffer: AudioBuffer,
  ): Promise<RawTranscriptionResult> {
    const worker = this.getWorker();
    const id = this.nextMessageId++;

    const transferables: Transferable[] = [];
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const copy = new Float32Array(audioBuffer.getChannelData(ch));
      channelData.push(copy);
      transferables.push(copy.buffer);
    }

    console.debug(`[transcription] Sending to worker (id=${id})`);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      worker.postMessage(
        {
          id,
          type: 'transcribe',
          channelData,
          sampleRate: audioBuffer.sampleRate,
          length: audioBuffer.length,
          modelId: this.modelId,
        },
        transferables,
      );
    });
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./transcription.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { type } = event.data;

        // Forward worker log messages to console
        if (type === 'log') {
          const { level, message } = event.data;
          console[level](message);
          return;
        }

        // Handle download progress updates
        if (type === 'download-progress') {
          this._downloadProgress.value = event.data.progress;
          console.debug(
            `[transcription] Model download progress: ${event.data.progress}%`,
          );
          return;
        }

        const response = event.data as TranscribeResponse;
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
          console.warn(
            `[transcription] Received worker response for unknown request id=${response.id}`,
          );
          return;
        }
        this.pendingRequests.delete(response.id);

        // Model is loaded — clear download progress
        this._downloadProgress.value = null;

        if (response.type === 'error') {
          console.error(
            `[transcription] Worker returned error for request id=${response.id}: ${response.message}`,
          );
          pending.reject(new Error(response.message));
        } else {
          console.debug(
            `[transcription] Worker result for request id=${response.id}: ${response.segments.length} segments`,
          );
          pending.resolve({
            language: response.language,
            segments: response.segments,
          });
        }
      };
      this.worker.onerror = (event) => {
        console.error('[transcription] Worker crashed (onerror):', event);
        this._downloadProgress.value = null;
        this.rejectAllPending(new Error('Transcription worker failed'));
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

  private async transcribeOnMainThread(
    audioBuffer: AudioBuffer,
  ): Promise<RawTranscriptionResult> {
    console.debug(
      '[transcription] Loading Whisper pipeline for main-thread inference...',
    );
    const transcriber = await this.loadMainThreadPipeline();

    const mono = downmixToMono(audioBuffer);
    const resampled = resampleToTarget(mono, audioBuffer.sampleRate);
    console.debug(
      `[transcription] Main-thread mono audio: ${resampled.length} samples at ${WHISPER_SAMPLE_RATE} Hz`,
    );

    const result = await transcriber(resampled, {
      return_timestamps: 'word',
      language: null,
    });

    const language: string = result.language ?? 'en';
    const chunks: { text: string; timestamp: [number, number | null] }[] =
      result.chunks ?? [];

    return { language, segments: groupWordsIntoSegments(chunks) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadMainThreadPipeline(): Promise<any> {
    if (this.mainThreadPipeline) return this.mainThreadPipeline;
    if (this.mainThreadPipelinePromise) return this.mainThreadPipelinePromise;

    this.mainThreadPipelinePromise = this.initializeMainThreadPipeline();
    this.mainThreadPipeline = await this.mainThreadPipelinePromise;
    this.mainThreadPipelinePromise = null;
    return this.mainThreadPipeline;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async initializeMainThreadPipeline(): Promise<any> {
    console.log(
      `[transcription] Loading Whisper model "${this.modelId}" on main thread...`,
    );
    const { pipeline: createPipeline, env } =
      await import('@huggingface/transformers');
    env.allowLocalModels = false;

    const transcriber = await createPipeline(
      'automatic-speech-recognition',
      this.modelId,
      { dtype: 'q8', device: 'wasm' },
    );

    console.log('[transcription] Whisper model loaded on main thread');
    return transcriber;
  }

  // --- Cleanup ---

  removeTranscription(trackId: TrackId): void {
    this.cache.delete(trackId);
    this.publishCache();
  }

  reset(): void {
    this.cache.clear();
    this.publishCache();
  }

  // --- Internal state management ---

  private setEntry(trackId: TrackId, entry: TranscriptionEntry): void {
    this.cache.set(trackId, entry);
    this.publishCache();
  }

  private publishCache(): void {
    this._transcriptions.value = new Map(this.cache);
  }
}

// --- Audio utilities (main-thread fallback) ---

// Whisper expects 16 kHz mono audio
const WHISPER_SAMPLE_RATE = 16_000;

function downmixToMono(audioBuffer: AudioBuffer): Float32Array {
  const length = audioBuffer.length;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / numberOfChannels;
    }
  }
  return mono;
}

function resampleToTarget(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === WHISPER_SAMPLE_RATE) return input;

  const ratio = fromRate / WHISPER_SAMPLE_RATE;
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

// Groups word-level chunks into segments by detecting pauses.
// A new segment starts when the gap between consecutive words exceeds the threshold.
const SEGMENT_GAP_THRESHOLD_SECONDS = 1.0;

type WhisperChunk = {
  text: string;
  timestamp: [number, number | null];
};

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

export default TranscriptionService;
