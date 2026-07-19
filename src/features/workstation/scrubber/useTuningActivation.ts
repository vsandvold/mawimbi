import { useState } from 'react';

const TUNE_QUERY_PARAM = 'tune';

/**
 * The tuning overlay is a hidden dev tool — available in dev builds, and on
 * deployed previews via `?tune` so the owner can tune without a local
 * checkout. Read once per mount: query params don't change without a full
 * navigation in this app's routing model.
 */
export function useTuningAvailable(): boolean {
  const [isAvailable] = useState(() => isTuningAvailable());
  return isAvailable;
}

function isTuningAvailable(): boolean {
  if (import.meta.env.DEV) return true;
  return new URLSearchParams(window.location.search).has(TUNE_QUERY_PARAM);
}
