import { useCallback, useRef } from 'react';

type DebouncedOptions = {
  timeoutMs: number;
};

const defaultOptions: DebouncedOptions = { timeoutMs: 100 };

const useDebounced = (callback: () => void, { timeoutMs } = defaultOptions) => {
  const timeoutRef = useRef<number | null>(null);

  const debounced = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      callback();
      timeoutRef.current = null;
    }, timeoutMs);
  }, [callback, timeoutMs]);

  return debounced;
};

export default useDebounced;
