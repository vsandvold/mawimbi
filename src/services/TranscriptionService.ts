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
} from '../types/transcription';
import type { WorkerMessage, TranscribeResponse } from './transcription.worker';

export type TranscriptionState = 'idle' | 'transcribing' | 'done' | 'error';

type TranscriptionEntry = {
  state: TranscriptionState;
  result?: Transcription;
};

type PendingRequest = {
  resolve: (result: {
    language: string;
    segments: TranscriptionSegment[];
  }) => void;
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
  private nextMessageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();

  constructor() {
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
      const rawResult = await this.transcribeInWorker(trackId, audioBuffer);
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(
        `[transcription] Transcription failed for track ${trackId}: ${detail}`,
      );
      this.setEntry(trackId, { state: 'error' });
      throw new Error(`Transcription failed for track ${trackId}: ${detail}`);
    }
  }

  // --- Worker-based inference ---

  private transcribeInWorker(
    trackId: TrackId,
    audioBuffer: AudioBuffer,
  ): Promise<{ language: string; segments: TranscriptionSegment[] }> {
    const worker = this.getWorker();
    const id = this.nextMessageId++;

    const transferables: Transferable[] = [];
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const copy = new Float32Array(audioBuffer.getChannelData(ch));
      channelData.push(copy);
      transferables.push(copy.buffer);
    }

    console.debug(
      `[transcription] Sending track ${trackId} to worker (id=${id})`,
    );

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      worker.postMessage(
        {
          id,
          type: 'transcribe',
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

export default TranscriptionService;
