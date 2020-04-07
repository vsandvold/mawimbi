import { useCallback, useRef } from 'react';

type DebouncedOptions = {
  timeoutMs: number;
};

const useDebounced = (
  callback: () => void,
  { timeoutMs = 100 }: DebouncedOptions
) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
