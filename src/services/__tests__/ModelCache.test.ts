import { vi } from 'vitest';
import { isModelCached, revalidateCache } from '../ModelCache';

const mockMatch = vi.fn();
const mockPut = vi.fn();
const mockKeys = vi.fn();

const mockCache = {
  match: mockMatch,
  put: mockPut,
  keys: mockKeys,
};

const mockCachesOpen = vi.fn().mockResolvedValue(mockCache);

vi.stubGlobal('caches', {
  open: mockCachesOpen,
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockKeys.mockReset();
  mockMatch.mockReset();
  mockPut.mockReset();
  mockCachesOpen.mockClear();
  mockFetch.mockReset();
});

describe('isModelCached', () => {
  it('returns true when cache contains entries for the model', async () => {
    mockKeys.mockResolvedValue([
      { url: 'https://huggingface.co/Xenova/clap-large/config.json' },
      { url: 'https://huggingface.co/Xenova/clap-large/model.onnx' },
    ]);

    const result = await isModelCached('Xenova/clap-large');

    expect(result).toBe(true);
  });

  it('returns false when cache has no entries for the model', async () => {
    mockKeys.mockResolvedValue([
      { url: 'https://huggingface.co/other-model/config.json' },
    ]);

    const result = await isModelCached('Xenova/clap-large');

    expect(result).toBe(false);
  });

  it('returns false when cache is empty', async () => {
    mockKeys.mockResolvedValue([]);

    const result = await isModelCached('Xenova/clap-large');

    expect(result).toBe(false);
  });

  it('returns false when caches API is unavailable', async () => {
    const originalCaches = globalThis.caches;
    // @ts-expect-error — simulating missing API
    delete globalThis.caches;

    const result = await isModelCached('Xenova/clap-large');

    expect(result).toBe(false);

    globalThis.caches = originalCaches;
  });

  it('returns false when cache.keys() throws', async () => {
    mockKeys.mockRejectedValue(new Error('Storage error'));

    const result = await isModelCached('Xenova/clap-large');

    expect(result).toBe(false);
  });

  it('opens the transformers-cache cache store', async () => {
    mockKeys.mockResolvedValue([]);

    await isModelCached('Xenova/clap-large');

    expect(mockCachesOpen).toHaveBeenCalledWith('transformers-cache');
  });
});

describe('revalidateCache', () => {
  it('fetches model files with conditional request headers', async () => {
    const modelUrl =
      'https://huggingface.co/Xenova/clap-large/resolve/main/config.json';
    mockKeys.mockResolvedValue([{ url: modelUrl }]);
    mockMatch.mockResolvedValue({
      headers: new Headers({
        etag: '"abc123"',
        'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
      }),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await revalidateCache('Xenova/clap-large');

    expect(mockFetch).toHaveBeenCalledWith(modelUrl, {
      headers: {
        'If-None-Match': '"abc123"',
        'If-Modified-Since': 'Wed, 01 Jan 2025 00:00:00 GMT',
      },
    });
  });

  it('updates the cache when server returns 200', async () => {
    const modelUrl =
      'https://huggingface.co/Xenova/clap-large/resolve/main/config.json';
    const request = { url: modelUrl };
    mockKeys.mockResolvedValue([request]);
    mockMatch.mockResolvedValue({
      headers: new Headers({ etag: '"abc123"' }),
    });
    const freshResponse = { ok: true, status: 200 };
    mockFetch.mockResolvedValue(freshResponse);

    await revalidateCache('Xenova/clap-large');

    expect(mockPut).toHaveBeenCalledWith(request, freshResponse);
  });

  it('does not update cache when server returns 304', async () => {
    const modelUrl =
      'https://huggingface.co/Xenova/clap-large/resolve/main/config.json';
    mockKeys.mockResolvedValue([{ url: modelUrl }]);
    mockMatch.mockResolvedValue({
      headers: new Headers({ etag: '"abc123"' }),
    });
    mockFetch.mockResolvedValue({ ok: false, status: 304 });

    await revalidateCache('Xenova/clap-large');

    expect(mockPut).not.toHaveBeenCalled();
  });

  it('only revalidates files matching the model ID', async () => {
    const modelUrl =
      'https://huggingface.co/Xenova/clap-large/resolve/main/config.json';
    const otherUrl =
      'https://huggingface.co/other-model/resolve/main/config.json';
    mockKeys.mockResolvedValue([{ url: modelUrl }, { url: otherUrl }]);
    mockMatch.mockResolvedValue({
      headers: new Headers({}),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await revalidateCache('Xenova/clap-large');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(modelUrl, expect.any(Object));
  });

  it('does not throw when fetch fails', async () => {
    mockKeys.mockResolvedValue([
      {
        url: 'https://huggingface.co/Xenova/clap-large/resolve/main/config.json',
      },
    ]);
    mockMatch.mockResolvedValue({
      headers: new Headers({}),
    });
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(revalidateCache('Xenova/clap-large')).resolves.not.toThrow();
  });

  it('does not throw when caches API is unavailable', async () => {
    const originalCaches = globalThis.caches;
    // @ts-expect-error — simulating missing API
    delete globalThis.caches;

    await expect(revalidateCache('Xenova/clap-large')).resolves.not.toThrow();

    globalThis.caches = originalCaches;
  });

  it('sends no conditional headers when cached response has none', async () => {
    const modelUrl =
      'https://huggingface.co/Xenova/clap-large/resolve/main/config.json';
    mockKeys.mockResolvedValue([{ url: modelUrl }]);
    mockMatch.mockResolvedValue({
      headers: new Headers({}),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await revalidateCache('Xenova/clap-large');

    expect(mockFetch).toHaveBeenCalledWith(modelUrl, { headers: {} });
  });
});
