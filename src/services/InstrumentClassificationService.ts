// InstrumentClassificationService — owns instrument classification state.
//
// Wraps Transformers.js zero-shot audio classification to detect the
// instrument in an audio track. Results are cached by TrackId and
// exposed as a signal for reactive consumers.

import { signal, type ReadonlySignal } from '@preact/signals-react';
import type { TrackId } from '../types/track';

export type ClassificationState = 'idle' | 'classifying' | 'done' | 'error';

export type ClassificationResult = {
  label: string;
  score: number;
};

type ClassificationEntry = {
  state: ClassificationState;
  result?: ClassificationResult;
};

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

export type InstrumentLabel = (typeof CANDIDATE_LABELS)[number];

// Sample rate expected by the CLAP model
const MODEL_SAMPLE_RATE = 48_000;

type Pipeline = (
  audio: Float32Array,
  labels: string[],
) => Promise<Array<{ label: string; score: number }>>;

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

  private pipeline: Pipeline | null = null;
  private pipelinePromise: Promise<Pipeline> | null = null;
  private cache = new Map<TrackId, ClassificationEntry>();

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
      const classifierPipeline = await this.loadPipeline();
      const monoSamples = downmixToMono(audioBuffer, MODEL_SAMPLE_RATE);
      const results = await classifierPipeline(monoSamples, [
        ...CANDIDATE_LABELS,
      ]);

      const top = results.reduce((best, current) =>
        current.score > best.score ? current : best,
      );

      const result: ClassificationResult = {
        label: top.label,
        score: top.score,
      };
      this.setEntry(trackId, { state: 'done', result });
      return top.label;
    } catch {
      this.setEntry(trackId, { state: 'error' });
      throw new Error(`Classification failed for track ${trackId}`);
    }
  }

  // --- Pipeline management ---

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

// --- Audio utilities ---

function downmixToMono(
  audioBuffer: AudioBuffer,
  targetSampleRate: number,
): Float32Array {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sourceSampleRate = audioBuffer.sampleRate;
  const sourceLength = audioBuffer.length;

  // Downmix to mono by averaging all channels
  const mono = new Float32Array(sourceLength);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < sourceLength; i++) {
      mono[i] += channelData[i] / numberOfChannels;
    }
  }

  // Resample if needed
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
