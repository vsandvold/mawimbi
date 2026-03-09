import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import './BottomSheet.css';
import { useBottomSheetDrag } from './useBottomSheetDrag';

// Height of the header area (handle + title row)
const HEADER_HEIGHT = 56;

// Default snap point heights (px)
const SNAP_POINT_PX = 280;
const SNAP_POINT_SMALL_PX = 160;
const SMALL_SCREEN_BREAKPOINT = 425;

// Near-top snap point (fraction of viewport)
const TOP_SNAP_RATIO = 0.85;

type BottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onHeightChange: (height: number) => void;
  title: string;
  children: ReactNode;
};

const BottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  title,
  children,
}: BottomSheetProps) => {
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
    () => [0, defaultSnap, topSnap],
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
      className="bottom-sheet"
      style={{
        height: totalHeight,
        transition: isDraggingRef.current ? 'none' : undefined,
      }}
    >
      <div
        className="bottom-sheet__header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="bottom-sheet__handle-bar" />
        <div className="bottom-sheet__title-row">
          <h2 className="bottom-sheet__title">{title}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            className="bottom-sheet__close"
            title="Close"
            onClick={handleClose}
          >
            <X size={16} />
          </Button>
        </div>
      </div>
      <div className="bottom-sheet__content" style={{ height: sheetHeight }}>
        {children}
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

export default BottomSheet;
