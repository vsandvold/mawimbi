import { signal, type ReadonlySignal } from '@preact/signals-react';

const DEFAULT_PIXELS_PER_SECOND = 200;
export const MIN_PIXELS_PER_SECOND = 50;
export const MAX_PIXELS_PER_SECOND = 800;
const ZOOM_STEP_FACTOR = 1.5;

const _pixelsPerSecond = signal(DEFAULT_PIXELS_PER_SECOND);

// Narrow channel for reactive consumers (hooks)
export const signals = {
  pixelsPerSecond: _pixelsPerSecond as ReadonlySignal<number>,
};

// Plain getter for non-reactive consumers (tests, workflows)
export function getPixelsPerSecond(): number {
  return _pixelsPerSecond.value;
}

export function zoomIn(): void {
  _pixelsPerSecond.value = clampZoom(_pixelsPerSecond.value * ZOOM_STEP_FACTOR);
}

export function zoomOut(): void {
  _pixelsPerSecond.value = clampZoom(_pixelsPerSecond.value / ZOOM_STEP_FACTOR);
}

export function setZoom(value: number): void {
  _pixelsPerSecond.value = clampZoom(value);
}

export function resetWorkstationSignals(): void {
  _pixelsPerSecond.value = DEFAULT_PIXELS_PER_SECOND;
}

function clampZoom(value: number): number {
  return Math.min(
    Math.max(value, MIN_PIXELS_PER_SECOND),
    MAX_PIXELS_PER_SECOND,
  );
}
