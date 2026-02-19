import { useCallback, useRef } from 'react';

type ThrottledOptions = {
  timeoutMs: number;
};

const defaultOptions: ThrottledOptions = {
  timeoutMs: 100,
};

const useThrottled = (
  callback: (value: any) => void,
  { timeoutMs } = defaultOptions,
) => {
  const timeoutRef = useRef<number | null>(null);

  const throttled = useCallback(
    (value: any) => {
      if (timeoutRef.current) {
        return;
      }
      callback(value);
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
      }, timeoutMs);
    },
    [callback, timeoutMs],
  );

  return throttled;
};

export default useThrottled;
