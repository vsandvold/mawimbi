import { signal } from '@preact/signals-react';

const DEFAULT_PIXELS_PER_SECOND = 200;

export const pixelsPerSecond = signal(DEFAULT_PIXELS_PER_SECOND);

export function resetWorkstationSignals(): void {
  pixelsPerSecond.value = DEFAULT_PIXELS_PER_SECOND;
}
