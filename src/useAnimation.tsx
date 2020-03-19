import { useEffect, useRef } from 'react';

const MAX_FPS = 60;

type AnimationOptions = {
  frameRate: number;
};

const useAnimation = (
  animationCallback: Function,
  options: AnimationOptions = { frameRate: 60 }
) => {
  let frameCount = 0;

  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const requestRef = useRef(0);
  const previousValueRef = useRef();

  const animate = (time: number) => {
    frameCount++;
    if (frameCount >= Math.round(MAX_FPS / options.frameRate)) {
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
