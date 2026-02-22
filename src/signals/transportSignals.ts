import { signal } from '@preact/signals-react';

export const transportTime = signal(0);
export const isPlaying = signal(false);
export const loudness = signal(0);

export function resetTransportSignals(): void {
  transportTime.value = 0;
  isPlaying.value = false;
  loudness.value = 0;
}
