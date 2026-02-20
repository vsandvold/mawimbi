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

function generateWav(durationSeconds, frequency, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(headerSize + dataSize - 8, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write sine wave samples
  const amplitude = 0.5 * 32767; // 50% volume
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * frequency * t));
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
