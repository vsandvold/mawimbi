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
  options: AnimationOptions = { frameRate: MAX_FPS, isActive: true }
) => {
  const frameStep = Math.round(MAX_FPS / options.frameRate);
  let frameCount = 0;

  const requestRef = useRef(0);
  const previousValueRef = useRef(options.initialValue);

  const requestCallback = () => {
    frameCount++;
    if (frameCount >= frameStep) {
      previousValueRef.current = animationCallback(previousValueRef.current);
      frameCount = 0;
    }
    requestRef.current = requestAnimationFrame(requestCallback);
  };

  useEffect(() => {
    if (options.isActive) {
      requestRef.current = requestAnimationFrame(requestCallback);
      return () => cancelAnimationFrame(requestRef.current);
    }
  }, animationDeps);
};

export default useAnimation;
