import { useEffect, useRef } from 'react';

const MAX_FPS = 60;

type AnimationOptions = {
  frameRate: number;
  isActive: boolean;
};

const useAnimation = (
  callback: () => void,
  { frameRate, isActive }: AnimationOptions = {
    frameRate: MAX_FPS,
    isActive: true,
  }
) => {
  const frameCountRef = useRef(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const frameStep = Math.round(MAX_FPS / frameRate);

    function requestCallback() {
      frameCountRef.current++;
      if (frameCountRef.current >= frameStep) {
        callback();
        frameCountRef.current = 0;
      }
      requestRef.current = requestAnimationFrame(requestCallback);
    }

    if (isActive) {
      requestRef.current = requestAnimationFrame(requestCallback);
      return () => cancelAnimationFrame(requestRef.current);
    }
  }, [callback, frameRate, isActive]);
};

export default useAnimation;
