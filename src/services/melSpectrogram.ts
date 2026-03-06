// melSpectrogram — essentia.js WASM mel spectrogram computation.
//
// Wraps EssentiaTFInputExtractor ('musicnn' type) to compute mel spectrograms
// matching the parameters Discogs-EffNet expects: 96 mel bands, frame=512,
// hop=256 at 16 kHz. The extractor's default patch size (187 for MusiCNN) is
// ignored — frames are re-patched into groups of 128 for EffNet.

// EffNet input dimensions: 128 time frames × 96 mel bands per patch
const PATCH_SIZE = 128;
const MEL_BANDS = 96;

// Log compression matching Essentia's TensorflowInputMusiCNN
const LOG_COMPRESSION_FACTOR = 10_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

async function getExtractor() {
  if (extractorInstance) return extractorInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamic imports — WASM module + model extractor
    const [{ default: EssentiaWASM }, { EssentiaTFInputExtractor }] =
      await Promise.all([
        import('essentia.js/dist/essentia-wasm.es.js'),
        import('essentia.js/dist/essentia.js-model.es.js'),
      ]);

    const wasmModule = await EssentiaWASM();
    extractorInstance = new EssentiaTFInputExtractor(wasmModule, 'musicnn');
    return extractorInstance;
  })();

  extractorInstance = await initPromise;
  initPromise = null;
  return extractorInstance;
}

/**
 * Computes mel spectrogram patches from mono 16 kHz audio.
 *
 * Returns an array of Float32Array patches, each containing
 * PATCH_SIZE × MEL_BANDS (128 × 96 = 12288) values with log compression
 * applied. Any leftover frames that don't fill a complete patch are discarded.
 */
export async function computeMelSpectrogram(
  monoAudio: Float32Array,
): Promise<Float32Array[]> {
  const extractor = await getExtractor();

  // computeFrameWise returns { melSpectrum, melBandsSize, patchSize, ... }
  // melSpectrum is a flat Float32Array: totalFrames × melBandsSize
  const features = extractor.computeFrameWise(monoAudio);
  const melSpectrum: Float32Array = features.melSpectrum;
  const totalFrames = melSpectrum.length / MEL_BANDS;
  const patchCount = Math.floor(totalFrames / PATCH_SIZE);

  const patches: Float32Array[] = [];
  for (let p = 0; p < patchCount; p++) {
    const patch = new Float32Array(PATCH_SIZE * MEL_BANDS);
    const startFrame = p * PATCH_SIZE;

    for (let f = 0; f < PATCH_SIZE; f++) {
      for (let b = 0; b < MEL_BANDS; b++) {
        const rawValue = melSpectrum[(startFrame + f) * MEL_BANDS + b];
        // Log compression: log10(1 + 10000 * x)
        patch[f * MEL_BANDS + b] = Math.log10(
          1 + LOG_COMPRESSION_FACTOR * rawValue,
        );
      }
    }

    patches.push(patch);
  }

  return patches;
}
