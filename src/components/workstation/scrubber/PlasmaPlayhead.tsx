import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  type TrackFrequencyInput,
  createPlasmaState,
  renderIdleFrame,
  renderPlasmaFrame,
} from './plasmaRenderer';

export const PLASMA_WIDTH = 240;

export type PlasmaPlayheadHandle = {
  render: (
    frequencyData: Uint8Array | null,
    loudness: number,
    scrollLeft: number,
    trackFrequencyInputs: TrackFrequencyInput[],
  ) => void;
  renderIdle: () => void;
  resize: (height: number) => void;
};

type PlasmaPlayheadProps = {
  height: number;
};

const PlasmaPlayhead = forwardRef<PlasmaPlayheadHandle, PlasmaPlayheadProps>(
  ({ height }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stateRef = useRef(createPlasmaState());
    const lastTimeRef = useRef(0);

    const centerX = PLASMA_WIDTH / 2;

    useImperativeHandle(ref, () => ({
      render(
        frequencyData: Uint8Array | null,
        loudness: number,
        scrollLeft: number,
        trackFrequencyInputs: TrackFrequencyInput[],
      ) {
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
          canvas.height,
          PLASMA_WIDTH,
          scrollLeft,
          centerX,
          now,
          deltaTime,
          trackFrequencyInputs,
        );
      },

      renderIdle() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        lastTimeRef.current = 0;
        renderIdleFrame(ctx, canvas.height, PLASMA_WIDTH, centerX);
      },

      resize(newHeight: number) {
        const canvas = canvasRef.current;
        if (canvas && canvas.height !== newHeight) {
          canvas.height = newHeight;
        }
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        className="plasma-playhead"
        width={PLASMA_WIDTH}
        height={height}
      />
    );
  },
);

PlasmaPlayhead.displayName = 'PlasmaPlayhead';

export default PlasmaPlayhead;
