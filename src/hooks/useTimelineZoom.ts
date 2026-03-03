import { type RefObject, useEffect, useRef } from 'react';
import { useRecordingService } from './useAudioService';
import { pixelsPerSecond, setZoom } from '../signals/workstationSignals';

const WHEEL_ZOOM_FACTOR = 0.05;

export function useTimelineZoom(ref: RefObject<HTMLDivElement | null>): {
  isPinchingRef: RefObject<boolean>;
} {
  const recordingService = useRecordingService();
  const isPinchingRef = useRef(false);
  const initialDistanceRef = useRef(0);
  const initialPPSRef = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && !recordingService.isRecording.value) {
        isPinchingRef.current = true;
        initialDistanceRef.current = getTouchDistance(
          e.touches[0],
          e.touches[1],
        );
        initialPPSRef.current = pixelsPerSecond.value;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinchingRef.current) {
        e.preventDefault();
        const distance = getTouchDistance(e.touches[0], e.touches[1]);
        const scale = distance / initialDistanceRef.current;
        setZoom(initialPPSRef.current * scale);
      }
    };

    const handleTouchEnd = () => {
      isPinchingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && !recordingService.isRecording.value) {
        e.preventDefault();
        const direction = e.deltaY > 0 ? -1 : 1;
        const factor = 1 + direction * WHEEL_ZOOM_FACTOR;
        setZoom(pixelsPerSecond.value * factor);
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('wheel', handleWheel);
    };
  }, [ref, recordingService]);

  return { isPinchingRef };
}

function getTouchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
