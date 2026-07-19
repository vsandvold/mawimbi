import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  renderLoudnessMeterFrame,
  renderLoudnessMeterIdle,
} from './loudnessMeterRenderer';

export type LoudnessMeterPlayheadHandle = {
  render: (frequencyData: Uint8Array | null, loudness: number) => void;
  renderIdle: () => void;
  resize: (width: number, height: number) => void;
};

type LoudnessMeterPlayheadProps = {
  width: number;
  height: number;
  /** Runway width at the playhead line, as a fraction of the canvas width —
      derived from the solved geometry so the meter's edges align with the
      runway rails (mawimbi#461). */
  meterWidthFraction: number;
};

const LoudnessMeterPlayhead = forwardRef<
  LoudnessMeterPlayheadHandle,
  LoudnessMeterPlayheadProps
>(({ width, height, meterWidthFraction }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    render(frequencyData: Uint8Array | null) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      renderLoudnessMeterFrame(
        ctx,
        frequencyData,
        canvas.width,
        canvas.height,
        meterWidthFraction,
      );
    },

    renderIdle() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      renderLoudnessMeterIdle(
        ctx,
        canvas.width,
        canvas.height,
        meterWidthFraction,
      );
    },

    resize(newWidth: number, newHeight: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (canvas.width !== newWidth) canvas.width = newWidth;
      if (canvas.height !== newHeight) canvas.height = newHeight;
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="loudness-meter-playhead"
      width={width}
      height={height}
    />
  );
});

LoudnessMeterPlayhead.displayName = 'LoudnessMeterPlayhead';

export default LoudnessMeterPlayhead;
