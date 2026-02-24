import { useLayoutEffect, useRef, useState } from 'react';

export function useContainerHeight() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Synchronous initial measurement (prevents flash of empty content)
    const rect = el.getBoundingClientRect();
    setHeight(rect.height);

    // Re-measure when the container resizes. This handles the case where
    // the initial measurement returns 0 (e.g. Timeline mounting before
    // flex layout resolves) and the container gains height later.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return { containerRef, height };
}
