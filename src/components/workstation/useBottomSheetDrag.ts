import { type MutableRefObject, useCallback, useRef } from 'react';

type UseBottomSheetDragOptions = {
  minHeight: number;
  maxHeight: number;
  snapPoint: number;
  isDraggingRef: MutableRefObject<boolean>;
  onHeightChange: (height: number) => void;
  onClose: () => void;
};

// Minimum drag distance before the sheet snaps closed
const CLOSE_THRESHOLD = 40;

/**
 * Pointer-event-based drag handler for resizing a bottom sheet.
 * Dragging up increases height; dragging down decreases it.
 * On release, snaps to the snap point or closes if dragged below threshold.
 */
export function useBottomSheetDrag({
  minHeight,
  maxHeight,
  snapPoint,
  isDraggingRef,
  onHeightChange,
  onClose,
}: UseBottomSheetDragOptions) {
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const currentHeightRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = currentHeightRef.current || snapPoint;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [snapPoint, isDraggingRef],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startYRef.current) return;
      const deltaY = startYRef.current - e.clientY;
      const newHeight = Math.max(
        0,
        Math.min(startHeightRef.current + deltaY, maxHeight),
      );
      currentHeightRef.current = newHeight;
      onHeightChange(newHeight);
    },
    [maxHeight, onHeightChange],
  );

  const handlePointerUp = useCallback(() => {
    const height = currentHeightRef.current;
    startYRef.current = 0;
    isDraggingRef.current = false;

    if (height < minHeight - CLOSE_THRESHOLD) {
      currentHeightRef.current = 0;
      onHeightChange(0);
      onClose();
    } else {
      currentHeightRef.current = snapPoint;
      onHeightChange(snapPoint);
    }
  }, [minHeight, snapPoint, isDraggingRef, onHeightChange, onClose]);

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
