// ModelCache — Cache API utility implementing stale-while-revalidate
// for Transformers.js model files.
//
// Transformers.js stores downloaded model files in a Cache API cache
// named 'transformers-cache'. This module provides two capabilities:
//
// 1. Check whether model files are already cached (to decide between
//    a fast cache-only load vs. a network-first load).
//
// 2. Revalidate cached files in the background using conditional
//    requests (ETag / If-None-Match). Only files that have actually
//    changed on the server are re-downloaded — unchanged files return
//    304 Not Modified and the existing cache entry is kept.
//
// Together these enable stale-while-revalidate: the pipeline loads
// instantly from cache, while a background pass ensures the cache
// stays fresh for the next session.

const CACHE_NAME = 'transformers-cache';

/**
 * Returns true if the Cache API contains at least one entry whose URL
 * includes the given model ID (e.g. 'Xenova/clap-large').
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return keys.some((request) => request.url.includes(modelId));
  } catch {
    return false;
  }
}

/**
 * Re-fetches all cached files for the given model using conditional
 * requests. Files that are unchanged on the server (304) are skipped.
 * Updated files (200) replace the stale cache entry.
 *
 * Failures are silently ignored — revalidation is best-effort.
 */
export async function revalidateCache(modelId: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const modelRequests = keys.filter((request) =>
      request.url.includes(modelId),
    );

    await Promise.allSettled(
      modelRequests.map(async (request) => {
        const cached = await cache.match(request);
        const headers: Record<string, string> = {};

        const etag = cached?.headers.get('etag');
        if (etag) headers['If-None-Match'] = etag;

        const lastModified = cached?.headers.get('last-modified');
        if (lastModified) headers['If-Modified-Since'] = lastModified;

        const response = await fetch(request.url, { headers });
        if (response.ok && response.status === 200) {
          await cache.put(request, response);
        }
      }),
    );
  } catch {
    // Revalidation failure is non-critical
  }
}
