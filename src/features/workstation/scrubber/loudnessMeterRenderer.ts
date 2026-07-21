import { midiNoteToBin } from '../../spectrogram/PianoRollRenderer';
import { type BarSmoother, computeTargetBarValues } from './barTransfer';
import { poolSemitoneBars } from './semitoneBars';
import { type ActiveNote, simulateSparkles } from './sparkleSimulation';

// --- Loudness meter rectangle ---

const BACKGROUND_COLOR = 'rgba(255, 255, 255, 0.15)';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.8)';
const BORDER_WIDTH = 1;
const BAR_COLOR = 'rgba(255, 255, 255, 0.9)';
const BAR_GAP = 1;

// Warm "welding" red-orange, chosen with a wide RGB spread (R dominant,
// G and B both low) so it stays distinguishable by hue from any
// track color in the palette (`COLOR_PALETTE`, projectPageReducer.ts) even
// alpha-blended over spectrogram content bleeding through the meter's
// translucent background — a plain saturation check can't tell sparkles
// apart from that bleed-through, only a hue-specific one can (mawimbi#484).
const SPARKLE_COLOR_RGB = '255, 60, 10';
const SPARKLE_PARTICLE_RADIUS_PX = 1.5;

export type MeterRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const METER_ASPECT_RATIO = 3; // width:height = 3:1

/**
 * Compute the meter rectangle, bottom-aligned within the canvas so its
 * bottom edge sits on the playhead line (mawimbi#481). Width is the
 * runway's rendered width at the playhead line (`widthFraction`, derived
 * from the solved geometry — mawimbi#461) so the meter's edges align with
 * the runway rails. Height follows the 3:1 aspect ratio, clamped to the
 * canvas height so wide viewports don't silently clip the rectangle.
 */
export function computeMeterRect(
  canvasWidth: number,
  canvasHeight: number,
  widthFraction: number,
): MeterRect {
  const width = Math.round(canvasWidth * widthFraction);
  const height = Math.min(
    Math.round(width / METER_ASPECT_RATIO),
    Math.round(canvasHeight),
  );
  const x = Math.round((canvasWidth - width) / 2);
  const y = Math.round(canvasHeight - height);
  return { x, y, width, height };
}

/**
 * Draw the meter background rectangle with border.
 */
function drawMeterBackground(
  ctx: CanvasRenderingContext2D,
  rect: MeterRect,
): void {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
}

type BarLayout = {
  innerX: number;
  effectiveBarWidth: number;
  effectiveGap: number;
};

/**
 * Horizontal bar layout shared by `drawFrequencyBars` and `computeBarCenterX`
 * — one formula for where semitone bars sit, so bars and sparkles (which
 * must land on the same x positions, mawimbi#484) cannot drift apart the way
 * two independent computations of the same mapping have before (the 12-TET
 * consistency bug class, kb/verification.md).
 */
function computeBarLayout(rect: MeterRect, barCount: number): BarLayout {
  const innerPadding = BORDER_WIDTH + 1;
  const innerX = rect.x + innerPadding;
  const innerWidth = rect.width - innerPadding * 2;

  // Calculate bar width: distribute bars across inner width with gaps
  const totalGapWidth = (barCount - 1) * BAR_GAP;
  const barWidth = (innerWidth - totalGapWidth) / barCount;

  // If bars would be too thin, skip gaps
  const effectiveBarWidth = barWidth < 1 ? innerWidth / barCount : barWidth;
  const effectiveGap = barWidth < 1 ? 0 : BAR_GAP;

  return { innerX, effectiveBarWidth, effectiveGap };
}

/**
 * The on-canvas x-center of semitone bar `barIndex` (may be fractional, e.g.
 * a note's `midiNoteToBin(midiNote) / 2`) — reused by the sparkle pass so a
 * note's burst anchors to the exact x position its own bar renders at.
 */
export function computeBarCenterX(
  rect: MeterRect,
  barCount: number,
  barIndex: number,
): number {
  if (barCount === 0) return rect.x + rect.width / 2;

  const { innerX, effectiveBarWidth, effectiveGap } = computeBarLayout(
    rect,
    barCount,
  );
  return (
    innerX +
    barIndex * (effectiveBarWidth + effectiveGap) +
    effectiveBarWidth / 2
  );
}

/**
 * Draw frequency bars inside the meter rectangle. One bar per semitone
 * (12-TET, mawimbi#482), growing upward from the bottom of the rectangle.
 * Bar n's x-center matches `midiNoteToBin(midiNote) / 2`
 * (`PianoRollRenderer.ts`), so the sparkle pass reuses the same positions
 * (`computeBarCenterX`). `barValues` are already gamma-transferred,
 * band-weighted, and ballistics-smoothed (`barTransfer.ts`, mawimbi#483) —
 * this function only maps them to pixels.
 */
function drawFrequencyBars(
  ctx: CanvasRenderingContext2D,
  rect: MeterRect,
  barValues: Float32Array,
): void {
  const barCount = barValues.length;
  if (barCount === 0) return;

  const innerPadding = BORDER_WIDTH + 1;
  const innerHeight = rect.height - innerPadding * 2;
  const innerBottom = rect.y + rect.height - innerPadding;
  const { innerX, effectiveBarWidth, effectiveGap } = computeBarLayout(
    rect,
    barCount,
  );

  ctx.fillStyle = BAR_COLOR;

  for (let i = 0; i < barCount; i++) {
    const intensity = barValues[i] / 255;
    const barHeight = Math.round(intensity * innerHeight);
    if (barHeight <= 0) continue;

    const barX = innerX + i * (effectiveBarWidth + effectiveGap);
    const barY = innerBottom - barHeight;

    ctx.fillRect(barX, barY, effectiveBarWidth, barHeight);
  }
}

/**
 * Draw the sparkle burst particles (mawimbi#484). Deliberately not
 * unit-tested — only `simulateSparkles`' particle math is (#365 pattern:
 * thin renderers over tested pure simulation). Tuning the look (color,
 * size) never touches tested logic.
 */
function drawSparkleParticles(
  ctx: CanvasRenderingContext2D,
  particles: ReturnType<typeof simulateSparkles>,
): void {
  for (const particle of particles) {
    ctx.fillStyle = `rgba(${SPARKLE_COLOR_RGB}, ${particle.intensity})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, SPARKLE_PARTICLE_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Main entry points ---

export function renderLoudnessMeterFrame(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array | null,
  canvasWidth: number,
  canvasHeight: number,
  widthFraction: number,
  barSmoother: BarSmoother,
  activeNotes: ActiveNote[],
  engineTime: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const rect = computeMeterRect(canvasWidth, canvasHeight, widthFraction);
  drawMeterBackground(ctx, rect);

  if (frequencyData) {
    const bars = poolSemitoneBars(frequencyData);
    const targets = computeTargetBarValues(bars);
    drawFrequencyBars(ctx, rect, barSmoother.update(targets));

    if (activeNotes.length > 0) {
      const lineY = rect.y + rect.height;
      const barCenterX = (midiNote: number) =>
        computeBarCenterX(rect, bars.length, midiNoteToBin(midiNote) / 2);
      const particles = simulateSparkles(
        activeNotes,
        engineTime,
        barCenterX,
        lineY,
      );
      drawSparkleParticles(ctx, particles);
    }
  }
}

export function renderLoudnessMeterIdle(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  widthFraction: number,
  barSmoother: BarSmoother,
): void {
  // The idle frame is drawn on every playback discontinuity (pause, stop,
  // seek — see Playhead.tsx/useScrubberScroll.ts's renderIdle() call
  // sites), so it doubles as the smoother's reset signal: without it,
  // resuming decays the stale pre-pause bars instead of reflecting the
  // new position immediately.
  barSmoother.reset();

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const rect = computeMeterRect(canvasWidth, canvasHeight, widthFraction);
  drawMeterBackground(ctx, rect);
}
