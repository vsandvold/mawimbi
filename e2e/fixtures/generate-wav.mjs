/**
 * Generates small WAV audio fixture files for e2e tests.
 *
 * - test-tone-short.wav: 0.5 second 440 Hz sine wave (mono, 16-bit, 44100 Hz)
 * - test-tone-long.wav:  2.0 second 440 Hz sine wave (mono, 16-bit, 44100 Hz)
 * - test-burst-tail.wav: 0.15s decaying noise burst + 1.85s true silence
 * - test-click-120bpm.wav: 32 percussive clicks at a known 120 BPM, plus
 *   trailing silence (tempo-estimator fixture, spec 007 M1)
 * - test-click-120bpm-swung.wav: 120 BPM, ~62% swung eighths (spec 008 M1)
 * - test-click-accelerando.wav: clicks ramping 100→140 BPM (spec 008 M1)
 * - test-click-then-continue.wav: 16 clicks at 120 BPM, then a continuous
 *   tone with no further clicks (spec 008 M1)
 * - test-arrhythmic-noise.wav: continuous noise, no periodic clicks (spec
 *   008 M1)
 *
 * Every rhythm fixture's click times are computed in `rhythmGroundTruth.mjs`
 * and imported here, so the audio this script writes and the ground truth a
 * test asserts against can never drift apart.
 *
 * Run: node e2e/fixtures/generate-wav.mjs
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  SWUNG_CLICK,
  SWUNG_CLICK_TIMES,
  ACCELERANDO_CLICK,
  ACCELERANDO_CLICK_TIMES,
  CLICKS_THEN_CONTINUE,
  CLICKS_THEN_CONTINUE_TIMES,
  ARRHYTHMIC_NOISE,
} from './rhythmGroundTruth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Deterministic PRNG (mulberry32) so the noise burst fixture regenerates to
 * identical bytes every run, matching the other (fully deterministic)
 * fixtures in this file rather than silently diffing on every regeneration.
 */
function createSeededRandom(seed) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Writes an exponentially-decaying noise burst — the shared shape behind
 * every percussive-hit fixture in this file (test-burst-tail.wav,
 * test-early-burst-14s.wav, test-click-120bpm.wav) — into `buffer` starting
 * at `startSample`. `random` is an already-seeded generator (not a seed),
 * so callers that need the sequence to keep advancing across repeated
 * bursts (test-click-120bpm.wav's per-beat clicks) can pass one shared
 * instance instead of getting a fresh one each call.
 */
function writeNoiseBurst(
  buffer,
  { headerSize, bytesPerSample, numSamples, sampleRate, startSample, lenSamples, decayTimeConstant, amplitude, random },
) {
  for (let i = 0; i < lenSamples; i++) {
    const idx = startSample + i;
    if (idx >= numSamples) break;
    const t = i / sampleRate;
    const envelope = Math.exp(-t / decayTimeConstant);
    const sample = Math.round(amplitude * envelope * (random() * 2 - 1));
    buffer.writeInt16LE(sample, headerSize + idx * bytesPerSample);
  }
}

function writeWavHeader(buffer, { numSamples, numChannels, sampleRate, bitsPerSample }) {
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(headerSize + dataSize - 8, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
}

function generateWav(durationSeconds, frequency, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);

  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  const amplitude = 0.5 * 32767;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * frequency * t));
    buffer.writeInt16LE(sample, headerSize + i * bytesPerSample);
  }

  return buffer;
}

/**
 * Generates a linear frequency sweep (chirp) WAV file.
 * The frequency varies linearly from startFreq to endFreq over the duration.
 * Produces a spectrogram that changes over time, unlike a constant tone.
 */
function generateChirpWav(durationSeconds, startFreq, endFreq, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);

  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  const amplitude = 0.5 * 32767;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Instantaneous phase of a linear chirp:
    // φ(t) = 2π (f0 t + (f1 - f0) t² / (2T))
    const phase = 2 * Math.PI * (startFreq * t + ((endFreq - startFreq) * t * t) / (2 * durationSeconds));
    const sample = Math.round(amplitude * Math.sin(phase));
    buffer.writeInt16LE(sample, headerSize + i * bytesPerSample);
  }

  return buffer;
}

/**
 * Generates a percussive fixture: a short exponentially-decaying white-noise
 * burst followed by true digital silence. Broadband noise (rather than a
 * tone) mimics a percussive hit's energy spread across the spectrogram's
 * frequency bins; the trailing silence gives reverb-tail assertions a known
 * near-black dry region to compare against (spec 004, #489).
 */
// Number of decay time-constants that fit inside the burst window — at 5,
// the envelope reaches e^-5 (~1% of peak) by the burst's end, so the
// burst/silence boundary has no audible discontinuity.
const BURST_TIME_CONSTANTS = 5;
// Arbitrary fixed seed — only its determinism matters, not its value.
const BURST_TAIL_NOISE_SEED = 442;

function generateBurstTailWav(burstSeconds, silenceSeconds, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * (burstSeconds + silenceSeconds));
  const burstSamples = Math.floor(sampleRate * burstSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);

  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  const amplitude = 0.8 * 32767;
  const decayTimeConstant = burstSeconds / BURST_TIME_CONSTANTS;
  const random = createSeededRandom(BURST_TAIL_NOISE_SEED);
  writeNoiseBurst(buffer, {
    headerSize,
    bytesPerSample,
    numSamples,
    sampleRate,
    startSample: 0,
    lenSamples: burstSamples,
    decayTimeConstant,
    amplitude,
    random,
  });
  // Remaining samples stay zeroed by Buffer.alloc — true silence.

  return buffer;
}

// Generate short fixture (0.5s)
const shortWav = generateWav(0.5, 440);
writeFileSync(join(__dirname, 'test-tone-short.wav'), shortWav);
console.log(`Created test-tone-short.wav (${shortWav.length} bytes)`);

// Generate long fixture (2.0s)
const longWav = generateWav(2.0, 440);
writeFileSync(join(__dirname, 'test-tone-long.wav'), longWav);
console.log(`Created test-tone-long.wav (${longWav.length} bytes)`);

// Generate chirp fixture (10s, 200 Hz → 4000 Hz)
// Produces a spectrogram that varies over time, unlike constant-tone files.
const chirpWav = generateChirpWav(10.0, 200, 4000);
writeFileSync(join(__dirname, 'test-chirp-10s.wav'), chirpWav);
console.log(`Created test-chirp-10s.wav (${chirpWav.length} bytes)`);

// Generate percussive burst-tail fixture (0.15s decaying noise + 1.85s silence)
const burstTailWav = generateBurstTailWav(0.15, 1.85);
writeFileSync(join(__dirname, 'test-burst-tail.wav'), burstTailWav);
console.log(`Created test-burst-tail.wav (${burstTailWav.length} bytes)`);

/**
 * Generates a long, mostly-silent fixture with a single decaying noise
 * burst positioned near the *start* only — deliberately asymmetric (not
 * mirrored front/back like test-burst-tail.wav) so a reversed time axis is
 * unambiguous: the energy would move from an early time-bucket to a late
 * one, not just swap between two symmetric ends (mawimbi#554).
 */
function generateEarlyBurstWav(durationSeconds, burstStartSeconds, burstLenSeconds, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);
  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  const amplitude = 0.85 * 32767;
  const random = createSeededRandom(BURST_TAIL_NOISE_SEED);
  const startSample = Math.floor(burstStartSeconds * sampleRate);
  const lenSamples = Math.floor(burstLenSeconds * sampleRate);
  const decayTimeConstant = burstLenSeconds / BURST_TIME_CONSTANTS;
  writeNoiseBurst(buffer, {
    headerSize,
    bytesPerSample,
    numSamples,
    sampleRate,
    startSample,
    lenSamples,
    decayTimeConstant,
    amplitude,
    random,
  });

  return buffer;
}

// Generate long early-burst fixture (14s total, burst at 1.0-1.4s)
const earlyBurstWav = generateEarlyBurstWav(14.0, 1.0, 0.4);
writeFileSync(join(__dirname, 'test-early-burst-14s.wav'), earlyBurstWav);
console.log(`Created test-early-burst-14s.wav (${earlyBurstWav.length} bytes)`);

/**
 * Generates a percussive click-track fixture at a known, fixed BPM: a
 * short decaying noise burst (the same envelope shape as
 * generateBurstTailWav's percussive hit) repeated on every beat, followed
 * by true silence. Gives a tempo estimator (spec 007 M1/M3) a
 * ground-truth BPM to check its output against, and — like
 * test-burst-tail.wav — a known-silent tail for reverb/delay assertions
 * that need a near-black dry region to compare against.
 */
const CLICK_TIME_CONSTANTS = 8;
const CLICK_NOISE_SEED = 120;

function generateClickTrackWav(
  bpm,
  numBeats,
  clickSeconds,
  tailSeconds,
  sampleRate = 44100,
) {
  const beatSeconds = 60 / bpm;
  const durationSeconds = (numBeats - 1) * beatSeconds + clickSeconds + tailSeconds;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);
  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  const amplitude = 0.9 * 32767;
  const clickSamples = Math.floor(sampleRate * clickSeconds);
  const decayTimeConstant = clickSeconds / CLICK_TIME_CONSTANTS;
  const random = createSeededRandom(CLICK_NOISE_SEED);

  for (let beat = 0; beat < numBeats; beat++) {
    const beatStartSample = Math.round(beat * beatSeconds * sampleRate);
    writeNoiseBurst(buffer, {
      headerSize,
      bytesPerSample,
      numSamples,
      sampleRate,
      startSample: beatStartSample,
      lenSamples: clickSamples,
      decayTimeConstant,
      amplitude,
      random,
    });
  }
  // Remaining samples stay zeroed by Buffer.alloc — true silence.

  return buffer;
}

// Generate 120 BPM click-track fixture: 32 beats (15.5s of clicks at
// 0.5s/beat) + 1.5s trailing silence. Duration matters here, not just
// beat count: essentia's RhythmExtractor2013 'multifeature'/'degara'
// confidence output measured 0 (a degenerate value, not merely low) on
// an earlier ~5s/8-beat version of this fixture and only became a usable
// non-zero signal once the same click pattern ran long enough — empirically
// confirmed in spec 007 M1's evaluation harness (kb/decisions.md, #557).
const clickTrackWav = generateClickTrackWav(120, 32, 0.03, 1.5);
writeFileSync(join(__dirname, 'test-click-120bpm.wav'), clickTrackWav);
console.log(`Created test-click-120bpm.wav (${clickTrackWav.length} bytes)`);

/**
 * Writes a decaying noise burst (the same percussive-hit envelope as
 * `writeNoiseBurst`) at each time in `times` (seconds) — the generalized
 * form of `generateClickTrackWav`'s fixed-interval loop, used by every
 * ground-truth-driven click fixture below (swung, accelerando, then-silence)
 * so their audio is built from the exact times a test will assert against.
 */
function writeClicksAtTimes(buffer, times, { headerSize, bytesPerSample, numSamples, sampleRate, clickSamples, decayTimeConstant, amplitude, random }) {
  for (const t of times) {
    writeNoiseBurst(buffer, {
      headerSize,
      bytesPerSample,
      numSamples,
      sampleRate,
      startSample: Math.round(t * sampleRate),
      lenSamples: clickSamples,
      decayTimeConstant,
      amplitude,
      random,
    });
  }
}

/**
 * Writes a sine tone into `buffer` over `[startSample, startSample +
 * lenSamples)`, with a short linear fade in/out (`fadeSeconds`) so the
 * segment's own onset doesn't itself read as a percussive click to an onset
 * detector — this fixture's whole point is a segment with *no* click-like
 * events.
 */
function writeToneSegment(buffer, { headerSize, bytesPerSample, numSamples, sampleRate, startSample, lenSamples, frequency, amplitude, fadeSeconds }) {
  const fadeSamples = Math.floor(fadeSeconds * sampleRate);
  for (let i = 0; i < lenSamples; i++) {
    const idx = startSample + i;
    if (idx >= numSamples) break;
    const t = i / sampleRate;
    let gain = 1;
    if (i < fadeSamples) gain = i / fadeSamples;
    else if (i >= lenSamples - fadeSamples) gain = (lenSamples - i) / fadeSamples;
    const sample = Math.round(amplitude * gain * Math.sin(2 * Math.PI * frequency * t));
    buffer.writeInt16LE(sample, headerSize + idx * bytesPerSample);
  }
}

/**
 * Generates the swung-click fixture (spec 008 M1): 120 BPM with ~62% swung
 * eighths — the geometry-is-the-annotation claim (onset ticks offset
 * against the induced beat grid) needs a fixture with a known, non-straight
 * micro-timing to prove against.
 */
function generateSwungClickWav(times, clickSeconds, tailSeconds, sampleRate = 44100) {
  const durationSeconds = times[times.length - 1] + clickSeconds + tailSeconds;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);
  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  writeClicksAtTimes(buffer, times, {
    headerSize,
    bytesPerSample,
    numSamples,
    sampleRate,
    clickSamples: Math.floor(sampleRate * clickSeconds),
    decayTimeConstant: clickSeconds / CLICK_TIME_CONSTANTS,
    amplitude: 0.9 * 32767,
    random: createSeededRandom(SWUNG_NOISE_SEED),
  });

  return buffer;
}

const SWUNG_NOISE_SEED = 162;
const swungClickWav = generateSwungClickWav(
  SWUNG_CLICK_TIMES,
  SWUNG_CLICK.clickSeconds,
  SWUNG_CLICK.tailSeconds,
);
writeFileSync(join(__dirname, 'test-click-120bpm-swung.wav'), swungClickWav);
console.log(`Created test-click-120bpm-swung.wav (${swungClickWav.length} bytes)`);

/**
 * Generates the accelerando fixture (spec 008 M1): clicks ramping 100→140
 * BPM — the rubato-class case where ticks must track the actual drifting
 * beat times rather than a fixed global tempo, and the induced grid must
 * adapt smoothly rather than reproducing per-beat jitter.
 */
function generateAccelerandoClickWav(times, clickSeconds, tailSeconds, sampleRate = 44100) {
  const durationSeconds = times[times.length - 1] + clickSeconds + tailSeconds;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);
  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  writeClicksAtTimes(buffer, times, {
    headerSize,
    bytesPerSample,
    numSamples,
    sampleRate,
    clickSamples: Math.floor(sampleRate * clickSeconds),
    decayTimeConstant: clickSeconds / CLICK_TIME_CONSTANTS,
    amplitude: 0.9 * 32767,
    random: createSeededRandom(ACCELERANDO_NOISE_SEED),
  });

  return buffer;
}

const ACCELERANDO_NOISE_SEED = 140;
const accelerandoClickWav = generateAccelerandoClickWav(
  ACCELERANDO_CLICK_TIMES,
  ACCELERANDO_CLICK.clickSeconds,
  ACCELERANDO_CLICK.tailSeconds,
);
writeFileSync(join(__dirname, 'test-click-accelerando.wav'), accelerandoClickWav);
console.log(`Created test-click-accelerando.wav (${accelerandoClickWav.length} bytes)`);

/**
 * Generates the clicks-then-continue fixture (spec 008 M1): 16 clicks at
 * 120 BPM, then a continuous tone with no further clicks — "beats stop,
 * audio continues" (not true silence), proving detection correctly stops
 * producing ticks once the clicking itself stops.
 */
function generateClicksThenContinueWav(
  times,
  { clickSeconds, continuationSeconds, continuationFrequency, continuationFadeSeconds },
  sampleRate = 44100,
) {
  const continuationStartSeconds = times[times.length - 1] + clickSeconds;
  const durationSeconds = continuationStartSeconds + continuationSeconds;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);
  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  writeClicksAtTimes(buffer, times, {
    headerSize,
    bytesPerSample,
    numSamples,
    sampleRate,
    clickSamples: Math.floor(sampleRate * clickSeconds),
    decayTimeConstant: clickSeconds / CLICK_TIME_CONSTANTS,
    amplitude: 0.9 * 32767,
    random: createSeededRandom(CLICKS_THEN_CONTINUE_NOISE_SEED),
  });

  writeToneSegment(buffer, {
    headerSize,
    bytesPerSample,
    numSamples,
    sampleRate,
    startSample: Math.round(continuationStartSeconds * sampleRate),
    lenSamples: numSamples - Math.round(continuationStartSeconds * sampleRate),
    frequency: continuationFrequency,
    amplitude: 0.5 * 32767,
    fadeSeconds: continuationFadeSeconds,
  });

  return buffer;
}

const CLICKS_THEN_CONTINUE_NOISE_SEED = 174;
const clicksThenContinueWav = generateClicksThenContinueWav(
  CLICKS_THEN_CONTINUE_TIMES,
  CLICKS_THEN_CONTINUE,
);
writeFileSync(join(__dirname, 'test-click-then-continue.wav'), clicksThenContinueWav);
console.log(`Created test-click-then-continue.wav (${clicksThenContinueWav.length} bytes)`);

/**
 * Generates the arrhythmic-noise fixture (spec 008 M1): continuous,
 * non-decaying white noise for the whole duration — no click envelope, no
 * periodicity. The absence-of-confidence case: essentia's tempo/onset
 * extractors must not hallucinate a confident grid here.
 */
function generateArrhythmicNoiseWav(durationSeconds, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(headerSize + numSamples * bytesPerSample);
  writeWavHeader(buffer, { numSamples, numChannels: 1, sampleRate, bitsPerSample: 16 });

  const amplitude = 0.5 * 32767;
  const random = createSeededRandom(ARRHYTHMIC_NOISE_SEED);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(amplitude * (random() * 2 - 1));
    buffer.writeInt16LE(sample, headerSize + i * bytesPerSample);
  }

  return buffer;
}

const ARRHYTHMIC_NOISE_SEED = 190;
const arrhythmicNoiseWav = generateArrhythmicNoiseWav(ARRHYTHMIC_NOISE.durationSeconds);
writeFileSync(join(__dirname, 'test-arrhythmic-noise.wav'), arrhythmicNoiseWav);
console.log(`Created test-arrhythmic-noise.wav (${arrhythmicNoiseWav.length} bytes)`);
