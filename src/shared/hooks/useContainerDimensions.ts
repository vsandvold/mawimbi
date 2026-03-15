import { useLayoutEffect, useRef, useState } from 'react';

type ContainerDimensions = {
  width: number;
  height: number;
};

export function useContainerDimensions() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<ContainerDimensions>({
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Synchronous initial measurement (prevents flash of empty content)
    const rect = el.getBoundingClientRect();
    setDimensions({ width: rect.width, height: rect.height });

    // Re-measure when the container resizes. This handles the case where
    // the initial measurement returns 0 (e.g. Timeline mounting before
    // flex layout resolves) and the container gains dimensions later.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return { containerRef, ...dimensions };
}
