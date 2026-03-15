// --- Loudness meter rectangle ---

const BACKGROUND_COLOR = 'rgba(255, 255, 255, 0.15)';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.8)';
const BORDER_WIDTH = 1;
const BAR_COLOR = 'rgba(255, 255, 255, 0.9)';
const BAR_GAP = 1;

export type MeterRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const METER_WIDTH_FRACTION = 0.75;
const METER_ASPECT_RATIO = 2; // width:height = 2:1

/**
 * Compute the meter rectangle with a 2:1 (width > height) aspect ratio,
 * centered within the canvas. Width is 75% of canvas width;
 * height is derived from the aspect ratio.
 */
export function computeMeterRect(
  canvasWidth: number,
  canvasHeight: number,
): MeterRect {
  const width = Math.round(canvasWidth * METER_WIDTH_FRACTION);
  const height = Math.round(width / METER_ASPECT_RATIO);
  const x = Math.round((canvasWidth - width) / 2);
  const y = Math.round((canvasHeight - height) / 2);
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

/**
 * Draw frequency bars inside the meter rectangle. One bar per CQT bin,
 * growing upward from the bottom of the rectangle.
 */
function drawFrequencyBars(
  ctx: CanvasRenderingContext2D,
  rect: MeterRect,
  frequencyData: Uint8Array,
): void {
  const bins = frequencyData.length;
  if (bins === 0) return;

  const innerPadding = BORDER_WIDTH + 1;
  const innerX = rect.x + innerPadding;
  const innerWidth = rect.width - innerPadding * 2;
  const innerHeight = rect.height - innerPadding * 2;
  const innerBottom = rect.y + rect.height - innerPadding;

  // Calculate bar width: distribute bins across inner width with gaps
  const totalGapWidth = (bins - 1) * BAR_GAP;
  const barWidth = (innerWidth - totalGapWidth) / bins;

  // If bars would be too thin, skip gaps
  const effectiveBarWidth = barWidth < 1 ? innerWidth / bins : barWidth;
  const effectiveGap = barWidth < 1 ? 0 : BAR_GAP;

  ctx.fillStyle = BAR_COLOR;

  for (let i = 0; i < bins; i++) {
    const intensity = frequencyData[i] / 255;
    const barHeight = Math.round(intensity * innerHeight);
    if (barHeight <= 0) continue;

    const barX = innerX + i * (effectiveBarWidth + effectiveGap);
    const barY = innerBottom - barHeight;

    ctx.fillRect(barX, barY, effectiveBarWidth, barHeight);
  }
}

// --- Main entry points ---

export function renderLoudnessMeterFrame(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array | null,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const rect = computeMeterRect(canvasWidth, canvasHeight);
  drawMeterBackground(ctx, rect);

  if (frequencyData) {
    drawFrequencyBars(ctx, rect, frequencyData);
  }
}

export function renderLoudnessMeterIdle(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const rect = computeMeterRect(canvasWidth, canvasHeight);
  drawMeterBackground(ctx, rect);
}
