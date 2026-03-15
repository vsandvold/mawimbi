// essentiaLoader — lazy initialization of the essentia.js core WASM module.
//
// Loads EssentiaWASM and creates an Essentia instance on first call.
// Subsequent calls return the cached instance. Intended for use inside
// the spectrogram worker where PredominantPitchMelodia and other
// algorithms will run.
//
// The WASM binary (~1 MB) is loaded dynamically to avoid blocking
// worker startup and to keep spectrogram analysis (CQT) functional
// even if essentia initialization fails.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EssentiaInstance = any;

let instance: EssentiaInstance | null = null;
let initPromise: Promise<EssentiaInstance> | null = null;

/**
 * Returns a lazily initialized Essentia instance backed by WASM.
 *
 * The first call loads the WASM module and creates the instance.
 * Concurrent calls during initialization share the same promise.
 * Subsequent calls return the cached instance immediately.
 */
export async function getEssentia(): Promise<EssentiaInstance> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [{ EssentiaWASM }, { default: Essentia }] = await Promise.all([
      import('essentia.js/dist/essentia-wasm.es.js'),
      import('essentia.js/dist/essentia.js-core.es.js'),
    ]);

    return new Essentia(EssentiaWASM);
  })();

  instance = await initPromise;
  initPromise = null;
  return instance;
}

/** Returns `true` if the WASM module has already been initialized. */
export function isEssentiaReady(): boolean {
  return instance !== null;
}

/**
 * Resets the cached instance. Intended for testing only — allows
 * re-initialization after mocks are swapped.
 */
export function resetEssentia(): void {
  if (instance && typeof instance.shutdown === 'function') {
    instance.shutdown();
  }
  instance = null;
  initPromise = null;
}
