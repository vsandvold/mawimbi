/**
 * Polyfill `window` in Web Worker environments.
 *
 * TensorFlow.js (used by @spotify/basic-pitch) references `window` internally
 * for its custom setTimeout mechanism. Web Workers don't have `window` — their
 * global scope is `self`. This polyfill aliases `window` to `self` so TF.js
 * can run without throwing "ReferenceError: window is not defined".
 *
 * MUST be imported before any TF.js / Basic Pitch imports.
 */
export function applyWorkerWindowPolyfill(): void {
  if (typeof window === 'undefined' && typeof self !== 'undefined') {
    (globalThis as Record<string, unknown>).window = self;
  }
}

applyWorkerWindowPolyfill();
