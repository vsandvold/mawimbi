import { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { type Track } from '../../types/track';
import Mixer from './Mixer';
import './MixerBottomSheet.css';

// Height of the drag handle area (padding + handle + padding)
const HANDLE_HEIGHT = 28;

// The snap point where the mixer sits by default (px).
// Below this, the timeline scales to follow the drawer height.
// Above this, the drawer overlays the timeline.
const SNAP_POINT_PX = '240px';
const SNAP_POINT_VALUE = 240;

// Small-screen snap point
const SNAP_POINT_SMALL_PX = '120px';
const SNAP_POINT_SMALL_VALUE = 120;

const SMALL_SCREEN_BREAKPOINT = 425;

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
  const contentRef = useRef<HTMLDivElement>(null);
  const [snapPoint, setSnapPoint] = useState(getSnapPoint());
  const [activeSnapPoint, setActiveSnapPoint] = useState<
    number | string | null
  >(null);

  // Update snap point on window resize
  useEffect(() => {
    const handleResize = () => setSnapPoint(getSnapPoint());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const snapPointValue = getSnapPointValue(snapPoint);

  // Track the visual height of the drawer content for timeline scaling.
  // The reported height is capped at the snap point so the timeline only
  // scales up to the snap point — beyond that the drawer overlays.
  const reportHeight = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const visualHeight = window.innerHeight - rect.top;
    const clampedHeight = Math.min(
      Math.max(visualHeight, 0),
      snapPointValue + HANDLE_HEIGHT,
    );
    onHeightChange(clampedHeight);
  }, [onHeightChange, snapPointValue]);

  // Observe the drawer content position via ResizeObserver + MutationObserver
  // Vaul animates by setting `transform: translateY(...)` on the content,
  // so we use a RAF loop while the drawer is open to track position changes.
  useEffect(() => {
    if (!isOpen) {
      onHeightChange(0);
      return;
    }

    let rafId: number;
    const tick = () => {
      reportHeight();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [isOpen, reportHeight, onHeightChange]);

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={onOpenChange}
      snapPoints={[snapPoint, 1]}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
      fadeFromIndex={1}
      modal={false}
      handleOnly
      noBodyStyles
    >
      <Drawer.Portal>
        <Drawer.Content
          ref={contentRef}
          className="mixer-bottom-sheet"
          aria-describedby={undefined}
        >
          <Drawer.Title className="mixer-bottom-sheet__sr-title">
            Mixer
          </Drawer.Title>
          <Drawer.Handle className="mixer-bottom-sheet__handle" />
          <div className="mixer-bottom-sheet__content">
            <Mixer tracks={tracks} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

function getSnapPoint(): string {
  if (window.innerHeight < SMALL_SCREEN_BREAKPOINT) {
    return SNAP_POINT_SMALL_PX;
  }
  return SNAP_POINT_PX;
}

function getSnapPointValue(snapPoint: string): number {
  if (snapPoint === SNAP_POINT_SMALL_PX) return SNAP_POINT_SMALL_VALUE;
  return SNAP_POINT_VALUE;
}

export default MixerBottomSheet;
