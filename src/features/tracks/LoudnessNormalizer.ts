// Target RMS in linear scale (~-14 dBFS)
const TARGET_RMS = 0.2;

// Tracks below this RMS are treated as silence and not normalized
const SILENCE_THRESHOLD = 0.001;

// Slider range boundaries
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;

// Slider-to-dB formula constant: slider maps [0, 100] via 20*ln((v+1)/SLIDER_SCALE)
const SLIDER_SCALE = 101;

function calculateRms(audioBuffer: AudioBuffer): number {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  if (length === 0) return 0;

  let sumSquares = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
  }

  const meanSquare = sumSquares / (numChannels * length);
  return Math.sqrt(meanSquare);
}

function calculateNormalizationGain(audioBuffer: AudioBuffer): number {
  const rms = calculateRms(audioBuffer);

  if (rms < SILENCE_THRESHOLD) return 0;

  const gainLinear = TARGET_RMS / rms;
  // Convert to standard dB: 20 * log10(gain)
  return 20 * Math.log10(gainLinear);
}

function gainToInitialVolume(normalizationGainDb: number): number {
  // Invert the slider-to-dB formula to find the slider position where
  // sliderDb + normalizationGainDb = 0 dB (original loudness).
  //
  // sliderDb = 20 * ln((v + 1) / 101)
  // Setting sliderDb = -normalizationGainDb:
  //   ln((v + 1) / 101) = -normalizationGainDb / 20
  //   v = 101 * exp(-normalizationGainDb / 20) - 1
  const volume = SLIDER_SCALE * Math.exp(-normalizationGainDb / 20) - 1;
  return Math.round(Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, volume)));
}

export const LoudnessNormalizer = {
  calculateRms,
  calculateNormalizationGain,
  gainToInitialVolume,
};
