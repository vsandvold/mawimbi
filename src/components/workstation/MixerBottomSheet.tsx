import { useCallback, useEffect, useRef, useState } from 'react';
import { type Track } from '../../types/track';
import Mixer from './Mixer';
import './MixerBottomSheet.css';
import { useBottomSheetDrag } from './useBottomSheetDrag';

// Height of the drag handle area (padding + handle + padding)
const HANDLE_HEIGHT = 28;

// Default snap point heights (px)
const SNAP_POINT_PX = 240;
const SNAP_POINT_SMALL_PX = 120;
const SMALL_SCREEN_BREAKPOINT = 425;

// Maximum height the sheet can be dragged to (fraction of viewport)
const MAX_HEIGHT_RATIO = 0.85;

type MixerBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onHeightChange: (height: number) => void;
  tracks: Track[];
};

const MixerBottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  tracks,
}: MixerBottomSheetProps) => {
  const [snapPoint, setSnapPoint] = useState(getSnapPoint);
  const [sheetHeight, setSheetHeight] = useState(0);
  const isDraggingRef = useRef(false);

  // Update snap point on window resize
  useEffect(() => {
    const handleResize = () => setSnapPoint(getSnapPoint());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxHeight = Math.round(window.innerHeight * MAX_HEIGHT_RATIO);
  const totalHeight = sheetHeight + HANDLE_HEIGHT;

  const handleHeightChange = useCallback(
    (height: number) => {
      setSheetHeight(height);
      const clamped = Math.min(height, snapPoint);
      onHeightChange(clamped + HANDLE_HEIGHT);
    },
    [onHeightChange, snapPoint],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const { handlePointerDown, handlePointerMove, handlePointerUp, setHeight } =
    useBottomSheetDrag({
      minHeight: SNAP_POINT_SMALL_PX,
      maxHeight,
      snapPoint,
      isDraggingRef,
      onHeightChange: handleHeightChange,
      onClose: handleClose,
    });

  // Animate open/close
  useEffect(() => {
    if (isOpen) {
      setSheetHeight(snapPoint);
      setHeight(snapPoint);
      onHeightChange(snapPoint + HANDLE_HEIGHT);
    } else {
      setSheetHeight(0);
      setHeight(0);
      onHeightChange(0);
    }
  }, [isOpen, snapPoint, setHeight, onHeightChange]);

  if (!isOpen) return null;

  return (
    <div
      className="mixer-bottom-sheet"
      style={{
        height: totalHeight,
        transition: isDraggingRef.current ? 'none' : undefined,
      }}
    >
      <div
        className="mixer-bottom-sheet__handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="mixer-bottom-sheet__handle-bar" />
      </div>
      <div
        className="mixer-bottom-sheet__content"
        style={{ height: sheetHeight }}
      >
        <Mixer tracks={tracks} />
      </div>
    </div>
  );
};

function getSnapPoint(): number {
  if (window.innerHeight < SMALL_SCREEN_BREAKPOINT) {
    return SNAP_POINT_SMALL_PX;
  }
  return SNAP_POINT_PX;
}

export default MixerBottomSheet;
