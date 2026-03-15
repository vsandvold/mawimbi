import { useEffect, useRef } from 'react';

/**
 * Runs a callback on every requestAnimationFrame tick.
 * The ref pattern ensures the latest callback is always called
 * without restarting the RAF loop on re-renders.
 */
export function useAnimationFrame(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let rafId: number;
    const loop = () => {
      callbackRef.current();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);
}
