/**
 * Generates small WAV audio fixture files for e2e tests.
 *
 * - test-tone-short.wav: 0.5 second 440 Hz sine wave (mono, 16-bit, 44100 Hz)
 * - test-tone-long.wav:  2.0 second 440 Hz sine wave (mono, 16-bit, 44100 Hz)
 *
 * Run: node e2e/fixtures/generate-wav.mjs
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
