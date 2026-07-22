/**
 * Generates a WAV file of arbitrary duration/content at test runtime
 * (mawimbi#538, spec 006 milestone 1) instead of committing multi-MB
 * fixtures for long-track e2e specs. Written into a gitignored temp dir
 * (`e2e/test-results/` is already excluded — see `.gitignore`).
 *
 * Adapts the header/synthesis logic from `e2e/fixtures/generate-wav.mjs`
 * (the committed short fixtures' generator) into a segment-composing API:
 * a fixture is a sequence of tone/silence/burst segments concatenated into
 * one mono 16-bit PCM WAV, so a spec can build e.g. "30s of tone" or "a
 * 3-minute track with a burst partway through" without a bespoke script.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const OUTPUT_DIR = join(__dirname, '..', 'test-results', 'generated-fixtures');

const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_TONE_FREQUENCY_HZ = 440;
const HEADER_SIZE = 44;
const BYTES_PER_SAMPLE = 2;
const TONE_AMPLITUDE = 0.5 * 32767;
// Louder than TONE_AMPLITUDE, matching generate-wav.mjs's burst generator —
// broadband noise at a percussive hit's energy reads differently from a
// sustained tone at the same peak.
const BURST_AMPLITUDE = 0.8 * 32767;
// Decay time-constants fitting inside a burst window (matches
// generate-wav.mjs's BURST_TIME_CONSTANTS) — by the burst's end the
// envelope has decayed to ~1% of peak, so the burst/silence boundary has
// no audible discontinuity.
const BURST_TIME_CONSTANTS = 5;
const BURST_NOISE_SEED = 538;

export type WavSegment =
  | { kind: 'tone'; seconds: number; frequencyHz?: number }
  | { kind: 'silence'; seconds: number }
  | { kind: 'burst'; seconds: number };

export type MakeWavFixtureOptions = {
  sampleRate?: number;
};

/**
 * Builds a mono 16-bit WAV from a sequence of segments and writes it to a
 * uniquely-named file under the gitignored fixtures temp dir. Returns the
 * absolute file path to hand to `uploadAudioFile`.
 */
export function makeWavFixture(
  segments: WavSegment[],
  { sampleRate = DEFAULT_SAMPLE_RATE }: MakeWavFixtureOptions = {},
): string {
  const segmentSamples = segments.map((segment) =>
    Math.floor(segment.seconds * sampleRate),
  );
  const numSamples = segmentSamples.reduce((sum, n) => sum + n, 0);
  const buffer = Buffer.alloc(HEADER_SIZE + numSamples * BYTES_PER_SAMPLE);
  writeWavHeader(buffer, { numSamples, sampleRate });

  let byteOffset = HEADER_SIZE;
  segments.forEach((segment, index) => {
    const numSegmentSamples = segmentSamples[index];
    if (segment.kind === 'tone') {
      writeToneSegment(
        buffer,
        byteOffset,
        numSegmentSamples,
        sampleRate,
        segment.frequencyHz ?? DEFAULT_TONE_FREQUENCY_HZ,
      );
    } else if (segment.kind === 'burst') {
      writeBurstSegment(buffer, byteOffset, numSegmentSamples, sampleRate);
    }
    byteOffset += numSegmentSamples * BYTES_PER_SAMPLE;
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  // Playwright runs specs across multiple parallel workers (fullyParallel,
  // playwright.config.ts) — a unique name per call avoids one worker's
  // fixture being overwritten mid-read by another's.
  const filename = `wav-fixture-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;
  const filePath = join(OUTPUT_DIR, filename);
  writeFileSync(filePath, buffer);
  return filePath;
}

/** Deterministic PRNG (mulberry32), matching generate-wav.mjs. */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function writeWavHeader(
  buffer: Buffer,
  { numSamples, sampleRate }: { numSamples: number; sampleRate: number },
): void {
  const blockAlign = BYTES_PER_SAMPLE; // mono, 16-bit
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(HEADER_SIZE + dataSize - 8, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
}

function writeToneSegment(
  buffer: Buffer,
  byteOffset: number,
  numSamples: number,
  sampleRate: number,
  frequencyHz: number,
): void {
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.round(
      TONE_AMPLITUDE * Math.sin(2 * Math.PI * frequencyHz * t),
    );
    buffer.writeInt16LE(sample, byteOffset + i * BYTES_PER_SAMPLE);
  }
}

function writeBurstSegment(
  buffer: Buffer,
  byteOffset: number,
  numSamples: number,
  sampleRate: number,
): void {
  const decayTimeConstant = numSamples / sampleRate / BURST_TIME_CONSTANTS;
  const random = createSeededRandom(BURST_NOISE_SEED);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / decayTimeConstant);
    const sample = Math.round(BURST_AMPLITUDE * envelope * (random() * 2 - 1));
    buffer.writeInt16LE(sample, byteOffset + i * BYTES_PER_SAMPLE);
  }
}
// Silence segments are left untouched — Buffer.alloc zero-fills.
