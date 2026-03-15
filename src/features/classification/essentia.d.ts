declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export function EssentiaWASM(): Promise<unknown>;
}

declare module 'essentia.js/dist/essentia.js-core.es.js' {
  type VectorFloat = unknown;

  class Essentia {
    constructor(wasmModule: unknown, isDebug?: boolean);
    version: string;
    algorithmNames: string;
    shutdown(): void;
    reinstate(): void;
    arrayToVector(inputArray: Float32Array): VectorFloat;
    vectorToArray(inputVector: VectorFloat): Float32Array;
    EqualLoudness(
      signal: VectorFloat,
      sampleRate?: number,
    ): { signal: VectorFloat };
    PredominantPitchMelodia(
      signal: VectorFloat,
      binResolution?: number,
      filterIterations?: number,
      frameSize?: number,
      guessUnvoiced?: boolean,
      harmonicWeight?: number,
      hopSize?: number,
      magnitudeCompression?: number,
      magnitudeThreshold?: number,
      maxFrequency?: number,
      minDuration?: number,
      minFrequency?: number,
      numberHarmonics?: number,
      peakDistributionThreshold?: number,
      peakFrameThreshold?: number,
      pitchContinuity?: number,
      referenceFrequency?: number,
      sampleRate?: number,
      timeContinuity?: number,
      voiceVibrato?: boolean,
      voicingTolerance?: number,
    ): { pitch: VectorFloat; pitchConfidence: VectorFloat };
  }
  export default Essentia;
}

declare module 'essentia.js/dist/essentia.js-model.es.js' {
  export class EssentiaTFInputExtractor {
    constructor(wasmModule: unknown, extractorType: string);
    computeFrameWise(audio: Float32Array): {
      melSpectrum: Float32Array;
      melBandsSize: number;
      patchSize: number;
    };
  }
}
