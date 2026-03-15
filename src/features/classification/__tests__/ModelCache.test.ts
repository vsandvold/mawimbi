import { vi } from 'vitest';
import { isModelCached, fetchModel } from '../ModelCache';

const mockMatch = vi.fn();
const mockPut = vi.fn();

const mockCache = {
  match: mockMatch,
  put: mockPut,
};

const mockCachesOpen = vi.fn().mockResolvedValue(mockCache);

vi.stubGlobal('caches', {
  open: mockCachesOpen,
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockMatch.mockReset();
  mockPut.mockReset();
  mockCachesOpen.mockClear();
  mockFetch.mockReset();
});

describe('isModelCached', () => {
  it('returns true when cache contains the URL', async () => {
    mockMatch.mockResolvedValue(new Response('data'));

    const result = await isModelCached('https://example.com/model.onnx');

    expect(result).toBe(true);
  });

  it('returns false when cache does not contain the URL', async () => {
    mockMatch.mockResolvedValue(undefined);

    const result = await isModelCached('https://example.com/model.onnx');

    expect(result).toBe(false);
  });

  it('returns false when caches API is unavailable', async () => {
    const originalCaches = globalThis.caches;
    // @ts-expect-error — simulating missing API
    delete globalThis.caches;

    const result = await isModelCached('https://example.com/model.onnx');

    expect(result).toBe(false);

    globalThis.caches = originalCaches;
  });

  it('returns false when cache.match() throws', async () => {
    mockMatch.mockRejectedValue(new Error('Storage error'));

    const result = await isModelCached('https://example.com/model.onnx');

    expect(result).toBe(false);
  });

  it('opens the essentia-models cache store', async () => {
    mockMatch.mockResolvedValue(undefined);

    await isModelCached('https://example.com/model.onnx');

    expect(mockCachesOpen).toHaveBeenCalledWith('essentia-models');
  });
});

describe('fetchModel', () => {
  it('returns cached response immediately when available', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const cachedResponse = new Response(data, {
      headers: { etag: '"abc"' },
    });
    mockMatch.mockResolvedValue(cachedResponse);

    // Background revalidation will call fetch — let it succeed
    mockFetch.mockResolvedValue({ ok: true, status: 304 });

    const result = await fetchModel('https://example.com/model.onnx');

    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it('fetches from network on cache miss and stores result', async () => {
    mockMatch.mockResolvedValue(undefined);

    const responseData = new Uint8Array([1, 2, 3, 4]);
    const response = new Response(responseData, {
      status: 200,
      statusText: 'OK',
    });
    vi.spyOn(response, 'clone').mockReturnValue(new Response(responseData));
    mockFetch.mockResolvedValue(response);

    const result = await fetchModel('https://example.com/model.onnx');

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(mockPut).toHaveBeenCalledWith(
      'https://example.com/model.onnx',
      expect.any(Response),
    );
  });

  it('throws when fetch returns non-ok response', async () => {
    mockMatch.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
    });

    await expect(fetchModel('https://example.com/model.onnx')).rejects.toThrow(
      'Failed to fetch',
    );
  });

  it('falls back to plain fetch when caches API is unavailable', async () => {
    const originalCaches = globalThis.caches;
    // @ts-expect-error — simulating missing API
    delete globalThis.caches;

    const responseData = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValue(new Response(responseData, { status: 200 }));

    const result = await fetchModel('https://example.com/model.onnx');

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/model.onnx');

    globalThis.caches = originalCaches;
  });

  it('calls onProgress during network download', async () => {
    mockMatch.mockResolvedValue(undefined);

    const chunk1 = new Uint8Array([1, 2, 3]);
    const chunk2 = new Uint8Array([4, 5]);

    let readCount = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        readCount++;
        if (readCount === 1) return { done: false, value: chunk1 };
        if (readCount === 2) return { done: false, value: chunk2 };
        return { done: true, value: undefined };
      }),
    };

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-length': '5' }),
      body: { getReader: () => mockReader },
      clone: vi.fn(),
    };
    mockFetch.mockResolvedValue(response);

    // Mock cache.put to accept the reconstructed response
    mockPut.mockResolvedValue(undefined);

    const onProgress = vi.fn();
    await fetchModel('https://example.com/model.onnx', onProgress);

    expect(onProgress).toHaveBeenCalledWith(3, 5);
    expect(onProgress).toHaveBeenCalledWith(5, 5);
  });
});
