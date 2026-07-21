import { useEffect, useRef } from 'react';
import { useRecordingService } from '../recording/useRecordingService';
import './MicLevelMeter.css';

type MicLevelMeterProps = {
  /** Poll and animate only while the microphone is actually open. */
  active: boolean;
};

const MicLevelMeter = ({ active }: MicLevelMeterProps) => {
  const recording = useRecordingService();
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;

    let rafId: number;
    const animate = () => {
      const level = Math.min(recording.getLoudness(), 1);
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${level})`;
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafId);
    // recording is a stable object from the bridge hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="mic-level-meter" data-testid="mic-level-meter">
      <div ref={barRef} className="mic-level-meter__bar" />
    </div>
  );
};

export default MicLevelMeter;
