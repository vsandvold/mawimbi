import { useEffect, useRef } from 'react';

const MAX_FPS = 60;

type AnimationOptions = {
  frameRate: number;
  initialValue?: any;
};

const useAnimation = (
  animationCallback: Function,
  options: AnimationOptions = { frameRate: MAX_FPS }
) => {
  const frameStep = Math.round(MAX_FPS / options.frameRate);
  let frameCount = 0;

  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const requestRef = useRef(0);
  const previousValueRef = useRef(options.initialValue);

  const animate = (time: number) => {
    frameCount++;
    if (frameCount >= frameStep) {
      previousValueRef.current = animationCallback(previousValueRef.current);
      frameCount = 0;
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, []); // Make sure the effect runs only once
};

export default useAnimation;
