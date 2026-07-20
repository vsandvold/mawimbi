import { type RefObject, useEffect, useRef } from 'react';
import { useRecordingService } from '../../features/recording/useRecordingService';
import { useWorkstation } from '../../features/workstation/useWorkstation';

const WHEEL_ZOOM_FACTOR = 0.05;

export function useTimelineZoom(ref: RefObject<HTMLDivElement | null>): {
  isPinchingRef: RefObject<boolean>;
} {
  const recording = useRecordingService();
  const workstation = useWorkstation();
  const isPinchingRef = useRef(false);
  const initialDistanceRef = useRef(0);
  const initialPPSRef = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && !recording.isRecording) {
        isPinchingRef.current = true;
        initialDistanceRef.current = getTouchDistance(
          e.touches[0],
          e.touches[1],
        );
        initialPPSRef.current = workstation.pixelsPerSecond;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinchingRef.current) {
        e.preventDefault();
        const distance = getTouchDistance(e.touches[0], e.touches[1]);
        const scale = distance / initialDistanceRef.current;
        workstation.setZoom(initialPPSRef.current * scale);
      }
    };

    const handleTouchEnd = () => {
      isPinchingRef.current = false;
    };

    // touchcancel (OS gesture takeover, incoming call, permission prompt)
    // ends a touch without a matching touchend — without this, isPinchingRef
    // would stick true forever, which (mawimbi#476) permanently blocks
    // single-finger scrubbing once the scrub controller starts reading it.
    // Same class of bug as the missing pointercancel handling fixed for
    // PhantomScroller in mawimbi#472/#474, applied to this separate native
    // touch-listener path.
    const handleTouchCancel = handleTouchEnd;

    const handleWheel = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && !recording.isRecording) {
        e.preventDefault();
        const direction = e.deltaY > 0 ? -1 : 1;
        const factor = 1 + direction * WHEEL_ZOOM_FACTOR;
        workstation.setZoom(workstation.pixelsPerSecond * factor);
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchCancel);
    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
      element.removeEventListener('wheel', handleWheel);
    };
    // Hook objects reference stable service singletons via getters
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isPinchingRef };
}

function getTouchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
