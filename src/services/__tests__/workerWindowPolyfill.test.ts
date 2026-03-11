import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applyWorkerWindowPolyfill', () => {
  it('sets globalThis.window to self when window is undefined', async () => {
    // Simulate a Web Worker environment: window is undefined, self exists
    vi.stubGlobal('window', undefined);
    const selfRef = globalThis.self;

    // Re-import to trigger the polyfill with fresh module state
    const { applyWorkerWindowPolyfill } =
      await import('../workerWindowPolyfill');
    applyWorkerWindowPolyfill();

    expect(globalThis.window).toBe(selfRef);
  });

  it('does not overwrite window when it is already defined', async () => {
    const originalWindow = globalThis.window;

    const { applyWorkerWindowPolyfill } =
      await import('../workerWindowPolyfill');
    applyWorkerWindowPolyfill();

    expect(globalThis.window).toBe(originalWindow);
  });
});
