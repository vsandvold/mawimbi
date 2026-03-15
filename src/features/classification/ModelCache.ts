// ModelCache — Cache API utility implementing stale-while-revalidate
// for ONNX model files hosted at essentia.upf.edu.
//
// Models are stored in a Cache API cache named 'essentia-models'.
// This module provides two capabilities:
//
// 1. Check whether a model URL is already cached (to decide between
//    a fast cache-only load vs. a network-first load).
//
// 2. Fetch a model with caching — returns the cached response if
//    available, then revalidates in the background using conditional
//    requests (ETag / If-None-Match). Only files that have actually
//    changed on the server are re-downloaded.

const CACHE_NAME = 'essentia-models';

/**
 * Returns true if the Cache API contains an entry for the given URL.
 */
export async function isModelCached(url: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    return match !== undefined;
  } catch {
    return false;
  }
}

/**
 * Fetches a model from the given URL with Cache API caching.
 * Returns the response body as an ArrayBuffer.
 *
 * If the model is already cached, returns the cached version immediately
 * and revalidates in the background. If not cached, fetches from the
 * network and stores in cache.
 *
 * Calls `onProgress` with bytes received so far and total bytes (from
 * Content-Length) during network downloads.
 */
export async function fetchModel(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url);

      if (cached) {
        // Return cached immediately, revalidate in background
        revalidateInBackground(cache, url, cached);
        return cached.clone().arrayBuffer();
      }

      // Not cached — fetch from network with progress
      const response = await fetchWithProgress(url, onProgress);
      await cache.put(url, response.clone());
      return response.arrayBuffer();
    } catch {
      // Cache API failure — fall through to plain fetch
    }
  }

  // Fallback: plain fetch without caching
  const response = await fetchWithProgress(url, onProgress);
  return response.arrayBuffer();
}

async function fetchWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  if (!onProgress || !response.body) {
    return response;
  }

  const contentLength = parseInt(
    response.headers.get('content-length') ?? '0',
    10,
  );
  if (!contentLength) {
    return response;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, contentLength);
  }

  const body = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function revalidateInBackground(
  cache: Cache,
  url: string,
  cached: Response,
): void {
  const headers: Record<string, string> = {};

  const etag = cached.headers.get('etag');
  if (etag) headers['If-None-Match'] = etag;

  const lastModified = cached.headers.get('last-modified');
  if (lastModified) headers['If-Modified-Since'] = lastModified;

  fetch(url, { headers })
    .then(async (response) => {
      if (response.ok && response.status === 200) {
        await cache.put(url, response);
      }
    })
    .catch(() => {
      // Revalidation failure is non-critical
    });
}
