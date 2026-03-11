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

// Height of the header area with title row (handle + title row)
const HEADER_HEIGHT_WITH_TITLE = 56;
// Height of the header area without title row (handle bar only)
const HEADER_HEIGHT_COMPACT = 20;

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
  title?: string;
  showClose?: boolean;
  snapPoints?: number[];
  children: ReactNode;
};

const BottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  title,
  showClose = true,
  snapPoints: customSnapPoints,
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

  const hasTitleRow = !!(title || showClose);
  const headerHeight = hasTitleRow
    ? HEADER_HEIGHT_WITH_TITLE
    : HEADER_HEIGHT_COMPACT;

  const topSnap = Math.round(window.innerHeight * TOP_SNAP_RATIO);
  const snapPoints = useMemo(
    () => customSnapPoints ?? [0, defaultSnap, topSnap],
    [customSnapPoints, defaultSnap, topSnap],
  );
  const totalHeight = sheetHeight + headerHeight;

  // For timeline scaling, cap height at the default snap point.
  // Beyond that the sheet overlays the timeline.
  const heightCap = customSnapPoints
    ? customSnapPoints[customSnapPoints.length - 1]
    : defaultSnap;

  const handleHeightChange = useCallback(
    (height: number) => {
      setSheetHeight(height);
      const clamped = Math.min(height, heightCap);
      onHeightChange(clamped + headerHeight);
    },
    [onHeightChange, heightCap, headerHeight],
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

  // The initial open height is the first snap point for custom snap points,
  // or the default snap for built-in snap points.
  const initialSnap = customSnapPoints ? customSnapPoints[0] : defaultSnap;

  // Animate open/close
  useEffect(() => {
    if (isOpen) {
      setSheetHeight(initialSnap);
      setHeight(initialSnap);
      onHeightChange(initialSnap + headerHeight);
    } else {
      setSheetHeight(0);
      setHeight(0);
      onHeightChange(0);
    }
  }, [isOpen, initialSnap, headerHeight, setHeight, onHeightChange]);

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
        className={`bottom-sheet__header ${hasTitleRow ? 'bottom-sheet__header--with-title' : 'bottom-sheet__header--compact'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="bottom-sheet__handle-bar" />
        {(title || showClose) && (
          <div className="bottom-sheet__title-row">
            {title && <h2 className="bottom-sheet__title">{title}</h2>}
            {!title && <div className="bottom-sheet__title" />}
            {showClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="bottom-sheet__close"
                title="Close"
                onClick={handleClose}
              >
                <X size={16} />
              </Button>
            )}
          </div>
        )}
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
