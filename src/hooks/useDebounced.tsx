import { useCallback, useRef } from 'react';

type DebouncedOptions = {
  timeoutMs?: number;
};

const defaultOptions: DebouncedOptions = { timeoutMs: 100 };

const useDebounced = (
  callback: () => void,
  { timeoutMs = defaultOptions.timeoutMs } = defaultOptions
) => {
  const timeoutRef = useRef<number | null>(null);

  const debounced = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback();
      timeoutRef.current = null;
    }, timeoutMs);
  }, [callback, timeoutMs]);

  return debounced;
};

export default useDebounced;
