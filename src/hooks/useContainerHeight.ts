import { useLayoutEffect, useRef, useState } from 'react';

export function useContainerHeight() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    if (containerRef.current) {
      const { height } = containerRef.current.getBoundingClientRect();
      setHeight(height);
    }
  }, []); // measure once on mount

  return { containerRef, height };
}
