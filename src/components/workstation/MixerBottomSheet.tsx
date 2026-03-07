import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Track } from '../../types/track';
import Mixer from './Mixer';
import './MixerBottomSheet.css';
import { useBottomSheetDrag } from './useBottomSheetDrag';

// Height of the header area (handle + title)
const HEADER_HEIGHT = 48;

// Default snap point heights (px)
const SNAP_POINT_PX = 240;
const SNAP_POINT_SMALL_PX = 120;
const SMALL_SCREEN_BREAKPOINT = 425;

// Near-top snap point (fraction of viewport)
const TOP_SNAP_RATIO = 0.85;

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
  const [defaultSnap, setDefaultSnap] = useState(getDefaultSnap);
  const [sheetHeight, setSheetHeight] = useState(0);
  const isDraggingRef = useRef(false);

  // Update snap point on window resize
  useEffect(() => {
    const handleResize = () => setDefaultSnap(getDefaultSnap());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const topSnap = Math.round(window.innerHeight * TOP_SNAP_RATIO);
  const snapPoints = useMemo(
    () => [defaultSnap, topSnap],
    [defaultSnap, topSnap],
  );
  const totalHeight = sheetHeight + HEADER_HEIGHT;

  const handleHeightChange = useCallback(
    (height: number) => {
      setSheetHeight(height);
      // Timeline scaling is capped at the default snap point.
      // Beyond that the sheet overlays the timeline.
      const clamped = Math.min(height, defaultSnap);
      onHeightChange(clamped + HEADER_HEIGHT);
    },
    [onHeightChange, defaultSnap],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const { handlePointerDown, handlePointerMove, handlePointerUp, setHeight } =
    useBottomSheetDrag({
      snapPoints,
      isDraggingRef,
      onHeightChange: handleHeightChange,
      onClose: handleClose,
    });

  // Animate open/close
  useEffect(() => {
    if (isOpen) {
      setSheetHeight(defaultSnap);
      setHeight(defaultSnap);
      onHeightChange(defaultSnap + HEADER_HEIGHT);
    } else {
      setSheetHeight(0);
      setHeight(0);
      onHeightChange(0);
    }
  }, [isOpen, defaultSnap, setHeight, onHeightChange]);

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
        className="mixer-bottom-sheet__header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="mixer-bottom-sheet__handle-bar" />
        <h2 className="mixer-bottom-sheet__title">Mixer</h2>
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

function getDefaultSnap(): number {
  if (window.innerHeight < SMALL_SCREEN_BREAKPOINT) {
    return SNAP_POINT_SMALL_PX;
  }
  return SNAP_POINT_PX;
}

export default MixerBottomSheet;
