import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  createPlasmaState,
  renderIdleFrame,
  renderPlasmaFrame,
} from './plasmaRenderer';

export const PLASMA_HEIGHT = 240;

export type PlasmaPlayheadHandle = {
  render: (frequencyData: Uint8Array | null, loudness: number) => void;
  renderIdle: () => void;
  resize: (width: number) => void;
};

type PlasmaPlayheadProps = {
  width: number;
};

const PlasmaPlayhead = forwardRef<PlasmaPlayheadHandle, PlasmaPlayheadProps>(
  ({ width }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stateRef = useRef(createPlasmaState());
    const lastTimeRef = useRef(0);

    const centerY = PLASMA_HEIGHT / 2;

    useImperativeHandle(ref, () => ({
      render(frequencyData: Uint8Array | null, loudness: number) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const now = performance.now();
        const deltaTime =
          lastTimeRef.current > 0
            ? Math.min(0.1, (now - lastTimeRef.current) / 1000)
            : 0.016;
        lastTimeRef.current = now;

        renderPlasmaFrame(
          ctx,
          stateRef.current,
          frequencyData,
          loudness,
          canvas.width,
          PLASMA_HEIGHT,
          centerY,
          now,
          deltaTime,
        );
      },

      renderIdle() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        lastTimeRef.current = 0;
        renderIdleFrame(ctx, canvas.width, PLASMA_HEIGHT, centerY);
      },

      resize(newWidth: number) {
        const canvas = canvasRef.current;
        if (canvas && canvas.width !== newWidth) {
          canvas.width = newWidth;
        }
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        className="plasma-playhead"
        width={width}
        height={PLASMA_HEIGHT}
      />
    );
  },
);

PlasmaPlayhead.displayName = 'PlasmaPlayhead';

export default PlasmaPlayhead;
