import { forwardRef, useImperativeHandle, useRef } from 'react';
import { BeatPulse } from '../../rhythm/BeatPulse';
import { BarSmoother } from './barTransfer';
import {
  renderLoudnessMeterFrame,
  renderLoudnessMeterIdle,
  repaintLoudnessMeterIdle,
  type MeterLayout,
} from './loudnessMeterRenderer';
import { type ActiveNote } from './sparkleSimulation';

export type LoudnessMeterPlayheadHandle = {
  // `loudness` (RMS, 0-1) is accepted but not yet read here — reserved for
  // the envelope-scaling follow-up (spec 003 Q3 dissent): bar shape stays
  // the relative spectrum, this would scale the overall envelope.
  render: (
    frequencyData: Uint8Array | null,
    loudness: number,
    activeNotes: ActiveNote[],
    engineTime: number,
    /** The anchor's induced grid in project time, empty without an anchor. */
    beatTimes: number[],
  ) => void;
  /** Playback moved discontinuously: rest the meter and reset ballistics. */
  renderIdle: () => void;
  /** The layout changed: redraw the same frame, keep ballistics running. */
  repaintIdle: () => void;
  resize: (width: number, height: number) => void;
};

type LoudnessMeterPlayheadProps = {
  width: number;
  height: number;
  /** Runway width at the playhead line, as a fraction of the canvas width —
      derived from the solved geometry so the meter's edges align with the
      runway rails (mawimbi#461). */
  meterWidthFraction: number;
  /** `string` switches to the centred, mirrored 3:4 meter (mawimbi#593). */
  layout?: MeterLayout;
};

const LoudnessMeterPlayhead = forwardRef<
  LoudnessMeterPlayheadHandle,
  LoudnessMeterPlayheadProps
>(({ width, height, meterWidthFraction, layout = 'runway' }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barSmootherRef = useRef(new BarSmoother());
  // Lives here rather than in the rAF loop for the same reason the bar
  // smoother does: both are per-frame ballistics owned by the canvas that
  // renders them, and both are reset by the discontinuity frame, which the
  // loop is not the only caller of. The *layout* redraws (`repaintIdle`)
  // are a separate entry point precisely because they are not
  // discontinuities and must leave the envelope's phase alone.
  const beatPulseRef = useRef(new BeatPulse());

  useImperativeHandle(ref, () => ({
    render(
      frequencyData: Uint8Array | null,
      _loudness: number,
      activeNotes: ActiveNote[],
      engineTime: number,
      beatTimes: number[],
    ) {
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
        barSmootherRef.current,
        activeNotes,
        engineTime,
        beatPulseRef.current,
        beatTimes,
        layout,
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
        barSmootherRef.current,
        beatPulseRef.current,
        layout,
      );
    },

    repaintIdle() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      repaintLoudnessMeterIdle(
        ctx,
        canvas.width,
        canvas.height,
        meterWidthFraction,
        layout,
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
