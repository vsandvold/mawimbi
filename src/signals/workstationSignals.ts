import { signal } from '@preact/signals-react';

const DEFAULT_PIXELS_PER_SECOND = 200;
export const MIN_PIXELS_PER_SECOND = 50;
export const MAX_PIXELS_PER_SECOND = 800;
const ZOOM_STEP_FACTOR = 1.5;

export const pixelsPerSecond = signal(DEFAULT_PIXELS_PER_SECOND);

export function zoomIn(): void {
  pixelsPerSecond.value = clampZoom(pixelsPerSecond.value * ZOOM_STEP_FACTOR);
}

export function zoomOut(): void {
  pixelsPerSecond.value = clampZoom(pixelsPerSecond.value / ZOOM_STEP_FACTOR);
}

export function setZoom(value: number): void {
  pixelsPerSecond.value = clampZoom(value);
}

export function resetWorkstationSignals(): void {
  pixelsPerSecond.value = DEFAULT_PIXELS_PER_SECOND;
}

function clampZoom(value: number): number {
  return Math.min(
    Math.max(value, MIN_PIXELS_PER_SECOND),
    MAX_PIXELS_PER_SECOND,
  );
}
