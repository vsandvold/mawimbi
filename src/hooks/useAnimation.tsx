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
  const frameStep = Math.round(MAX_FPS / frameRate);
  let frameCount = 0;

  const requestRef = useRef(0);
  const previousValueRef = useRef(initialValue);

  const requestCallback = () => {
    frameCount++;
    if (frameCount >= frameStep) {
      previousValueRef.current = animationCallback(previousValueRef.current);
      frameCount = 0;
    }
    requestRef.current = requestAnimationFrame(requestCallback);
  };

  useEffect(() => {
    if (isActive) {
      requestRef.current = requestAnimationFrame(requestCallback);
      return () => cancelAnimationFrame(requestRef.current);
    }
  }, [...animationDeps, isActive]);
};

export default useAnimation;
