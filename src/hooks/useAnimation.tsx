import { useEffect, useRef } from 'react';

const MAX_FPS = 60;

type AnimationOptions = {
  frameRate: number;
  isActive: boolean;
  initialValue?: any;
};

const useAnimation = (
  animationCallback: Function,
  animationDeps: any[],
  { frameRate = MAX_FPS, isActive = true, initialValue }: AnimationOptions
) => {
  const frameCountRef = useRef(0);
  const frameStep = Math.round(MAX_FPS / frameRate);

  const requestRef = useRef(0);
  const previousValueRef = useRef(initialValue);

  useEffect(() => {
    function requestCallback() {
      frameCountRef.current++;
      if (frameCountRef.current >= frameStep) {
        previousValueRef.current = animationCallback(previousValueRef.current);
        frameCountRef.current = 0;
      }
      requestRef.current = requestAnimationFrame(requestCallback);
    }
    if (isActive) {
      requestRef.current = requestAnimationFrame(requestCallback);
      return () => cancelAnimationFrame(requestRef.current);
    }
  }, [animationCallback, animationDeps, frameStep, isActive]);
};

export default useAnimation;
