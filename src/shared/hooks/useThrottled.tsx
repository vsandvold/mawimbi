import { throttle } from 'throttle-debounce';
import { useMemo, useRef } from 'react';

type ThrottledOptions = {
  timeoutMs?: number;
};

// Wraps throttle-debounce's throttle in a stable React hook.
// The ref pattern ensures the latest callback is always called without
// recreating (and resetting) the throttled function on every render.
const useThrottled = (
  callback: () => void,
  { timeoutMs = 100 }: ThrottledOptions = {},
) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useMemo(
    () => throttle(timeoutMs, () => callbackRef.current()),
    [timeoutMs],
  );
};

export default useThrottled;
