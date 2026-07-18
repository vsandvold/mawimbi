import { useEffect, useRef, useState } from 'react';

const TUNE_QUERY_PARAM = 'tune';
const LONG_PRESS_MS = 600;

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

type LongPressHandlers = {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
};

/** Fires `onLongPress` after a sustained pointer-down, the overlay's reveal gesture. */
export function useLongPress(onLongPress: () => void): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // A pending timer left running past unmount (e.g. navigating away mid-press)
  // would fire later against the module-level tuningSignals singleton with no
  // component left to display the result, silently opening the overlay on a
  // future mount instead.
  useEffect(() => cancel, []);

  return {
    onPointerDown: () => {
      cancel();
      timerRef.current = setTimeout(onLongPress, LONG_PRESS_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
  };
}
