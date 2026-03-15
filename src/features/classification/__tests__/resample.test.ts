import { resample } from '../resample';

describe('resample', () => {
  it('preserves signal length ratio', () => {
    const fromRate = 44100;
    const toRate = 16000;
    const durationSeconds = 1;
    const input = new Float32Array(fromRate * durationSeconds);

    const output = resample(input, fromRate, toRate);

    expect(output.length).toBe(toRate * durationSeconds);
  });

  it('returns input unchanged when rates match', () => {
    const input = new Float32Array([0.1, 0.5, -0.3, 0.8]);

    const output = resample(input, 16000, 16000);

    expect(output).toEqual(input);
  });

  it('preserves a low-frequency sine wave after downsampling', () => {
    const fromRate = 48000;
    const toRate = 16000;
    const freq = 440; // well below Nyquist (8 kHz)
    const duration = 0.1;
    const numSamples = fromRate * duration;
    const input = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      input[i] = Math.sin((2 * Math.PI * freq * i) / fromRate);
    }

    const output = resample(input, fromRate, toRate);

    // Measure energy of the output — should be roughly half (sine wave RMS)
    let energy = 0;
    for (let i = 0; i < output.length; i++) {
      energy += output[i] * output[i];
    }
    const rms = Math.sqrt(energy / output.length);
    // Sine wave RMS ≈ 0.707
    expect(rms).toBeGreaterThan(0.6);
    expect(rms).toBeLessThan(0.8);
  });

  it('attenuates frequencies above the target Nyquist when downsampling', () => {
    // This test catches missing anti-aliasing. A 12 kHz tone is above the
    // 8 kHz Nyquist of the 16 kHz target rate. Without a low-pass filter,
    // linear interpolation lets this energy fold back as aliasing.
    const fromRate = 48000;
    const toRate = 16000;
    const nyquist = toRate / 2; // 8 kHz
    const aliasFreq = nyquist * 1.5; // 12 kHz — above Nyquist
    const duration = 0.1;
    const numSamples = fromRate * duration;

    const input = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      input[i] = Math.sin((2 * Math.PI * aliasFreq * i) / fromRate);
    }

    const output = resample(input, fromRate, toRate);

    // Measure RMS of output — with proper anti-aliasing, the 12 kHz tone
    // should be heavily attenuated (RMS near 0). Without it, aliased energy
    // shows up as a lower-frequency ghost tone with significant amplitude.
    let energy = 0;
    for (let i = 0; i < output.length; i++) {
      energy += output[i] * output[i];
    }
    const rms = Math.sqrt(energy / output.length);

    // Anti-aliased: RMS should be < 0.1 (heavily attenuated)
    // Without filter: RMS ≈ 0.4-0.5 (aliased energy preserved)
    expect(rms).toBeLessThan(0.1);
  });
});
