/**
 * Generates small WAV audio fixture files for e2e tests.
 *
 * - test-tone-short.wav: 0.5 second 440 Hz sine wave (mono, 16-bit, 44100 Hz)
 * - test-tone-long.wav:  2.0 second 440 Hz sine wave (mono, 16-bit, 44100 Hz)
 * - test-burst-tail.wav: 0.15s decaying noise burst + 1.85s true silence
 *
 * Run: node e2e/fixtures/generate-wav.mjs
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  for (let i = 0; i < burstSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / decayTimeConstant);
    const sample = Math.round(amplitude * envelope * (random() * 2 - 1));
    buffer.writeInt16LE(sample, headerSize + i * bytesPerSample);
  }
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
  const random = createSeededRandom(442);
  const startSample = Math.floor(burstStartSeconds * sampleRate);
  const lenSamples = Math.floor(burstLenSeconds * sampleRate);
  const decay = burstLenSeconds / 5;
  for (let i = 0; i < lenSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / decay);
    const sample = Math.round(amplitude * envelope * (random() * 2 - 1));
    const idx = startSample + i;
    if (idx < numSamples) buffer.writeInt16LE(sample, headerSize + idx * bytesPerSample);
  }

  return buffer;
}

// Generate long early-burst fixture (14s total, burst at 1.0-1.4s)
const earlyBurstWav = generateEarlyBurstWav(14.0, 1.0, 0.4);
writeFileSync(join(__dirname, 'test-early-burst-14s.wav'), earlyBurstWav);
console.log(`Created test-early-burst-14s.wav (${earlyBurstWav.length} bytes)`);
