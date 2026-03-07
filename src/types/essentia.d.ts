declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export function EssentiaWASM(): Promise<unknown>;
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
