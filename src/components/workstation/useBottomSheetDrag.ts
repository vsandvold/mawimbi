import { type MutableRefObject, useCallback, useRef } from 'react';

type UseBottomSheetDragOptions = {
  snapPoints: number[];
  isDraggingRef: MutableRefObject<boolean>;
  onHeightChange: (height: number) => void;
  onClose: () => void;
};

// Minimum drag distance before the sheet snaps closed
const CLOSE_THRESHOLD = 40;

/**
 * Pointer-event-based drag handler for resizing a bottom sheet.
 * Dragging up increases height; dragging down decreases it.
 * On release, snaps to the nearest snap point or closes if dragged below threshold.
 */
export function useBottomSheetDrag({
  snapPoints,
  isDraggingRef,
  onHeightChange,
  onClose,
}: UseBottomSheetDragOptions) {
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const currentHeightRef = useRef(0);

  const minSnap = snapPoints[0];
  const maxSnap = snapPoints[snapPoints.length - 1];

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = currentHeightRef.current || minSnap;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [minSnap, isDraggingRef],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startYRef.current) return;
      const deltaY = startYRef.current - e.clientY;
      const newHeight = Math.max(
        0,
        Math.min(startHeightRef.current + deltaY, maxSnap),
      );
      currentHeightRef.current = newHeight;
      onHeightChange(newHeight);
    },
    [maxSnap, onHeightChange],
  );

  const handlePointerUp = useCallback(() => {
    const height = currentHeightRef.current;
    startYRef.current = 0;
    isDraggingRef.current = false;

    if (height < minSnap - CLOSE_THRESHOLD) {
      currentHeightRef.current = 0;
      onHeightChange(0);
      onClose();
    } else {
      const nearest = findNearestSnapPoint(height, snapPoints);
      currentHeightRef.current = nearest;
      onHeightChange(nearest);
    }
  }, [minSnap, snapPoints, isDraggingRef, onHeightChange, onClose]);

  const setHeight = useCallback((height: number) => {
    currentHeightRef.current = height;
  }, []);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setHeight,
  };
}

function findNearestSnapPoint(height: number, snapPoints: number[]): number {
  let nearest = snapPoints[0];
  let minDistance = Math.abs(height - nearest);

  for (let i = 1; i < snapPoints.length; i++) {
    const distance = Math.abs(height - snapPoints[i]);
    if (distance < minDistance) {
      nearest = snapPoints[i];
      minDistance = distance;
    }
  }

  return nearest;
}
