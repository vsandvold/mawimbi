import { vi } from 'vitest';

// Mock essentia.js WASM and core modules before importing the loader.
// The mock Essentia constructor records the WASM module it receives and
// exposes a version property for the smoke-test assertion.
const MOCK_VERSION = '0.1.3';
const mockShutdown = vi.fn();

vi.mock('essentia.js/dist/essentia-wasm.es.js', () => ({
  EssentiaWASM: { wasmReady: true },
}));

vi.mock('essentia.js/dist/essentia.js-core.es.js', () => {
  class MockEssentia {
    version = MOCK_VERSION;
    shutdown = mockShutdown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wasmModule: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(wasm: any) {
      this.wasmModule = wasm;
    }
  }
  return { default: MockEssentia };
});

// Import after mocks are registered
import { getEssentia, isEssentiaReady, resetEssentia } from '../essentiaLoader';

beforeEach(() => {
  resetEssentia();
  mockShutdown.mockClear();
});

describe('essentiaLoader', () => {
  it('loads and returns an Essentia instance', async () => {
    const essentia = await getEssentia();

    expect(essentia).toBeDefined();
    expect(essentia.version).toBe(MOCK_VERSION);
  });

  it('passes EssentiaWASM to the Essentia constructor', async () => {
    const essentia = await getEssentia();

    expect(essentia.wasmModule).toEqual({ wasmReady: true });
  });

  it('caches the instance across calls', async () => {
    const first = await getEssentia();
    const second = await getEssentia();

    expect(first).toBe(second);
  });

  it('shares the initialization promise for concurrent calls', async () => {
    const [a, b] = await Promise.all([getEssentia(), getEssentia()]);

    expect(a).toBe(b);
  });

  it('reports ready state after initialization', async () => {
    expect(isEssentiaReady()).toBe(false);

    await getEssentia();

    expect(isEssentiaReady()).toBe(true);
  });

  it('resets to uninitialized state and calls shutdown', async () => {
    await getEssentia();
    expect(isEssentiaReady()).toBe(true);

    resetEssentia();

    expect(isEssentiaReady()).toBe(false);
    expect(mockShutdown).toHaveBeenCalledOnce();
  });

  it('creates a fresh instance after reset', async () => {
    const first = await getEssentia();
    resetEssentia();
    const second = await getEssentia();

    expect(first).not.toBe(second);
    expect(second.version).toBe(MOCK_VERSION);
  });
});
