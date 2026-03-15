import { debounce } from 'throttle-debounce';
import { useMemo, useRef } from 'react';

type DebouncedOptions = {
  timeoutMs?: number;
};

// Wraps throttle-debounce's debounce in a stable React hook.
// The ref pattern ensures the latest callback is always called without
// recreating (and resetting) the debounced function on every render.
const useDebounced = (
  callback: () => void,
  { timeoutMs = 100 }: DebouncedOptions = {},
) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useMemo(
    () => debounce(timeoutMs, () => callbackRef.current()),
    [timeoutMs],
  );
};

export default useDebounced;
