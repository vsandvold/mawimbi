import { signal } from '@preact/signals-react';

export const transportTime = signal(0);
export const isPlaying = signal(false);
export const loudness = signal(0);
export const totalTime = signal(0);

// Tracks whether the next isPlaying change should include a seek to the
// current transportTime value.  Set by user-initiated seeks (scroll, rewind)
// and consumed by the transport bridge.
let pendingSeekTime: number | null = null;

export function togglePlayback(): void {
  const isEndOfPlayback =
    transportTime.value.toFixed(1) === totalTime.value.toFixed(1);
  if (isEndOfPlayback && !isPlaying.value) {
    // Set pending seek and transport time before toggling isPlaying,
    // because signal effects fire synchronously on isPlaying change.
    pendingSeekTime = 0;
    transportTime.value = 0;
    isPlaying.value = true;
  } else {
    isPlaying.value = !isPlaying.value;
  }
}

export function stopAndRewindPlayback(): void {
  // Set pending seek before toggling isPlaying, because signal effects
  // fire synchronously on isPlaying change.
  pendingSeekTime = 0;
  isPlaying.value = false;
  transportTime.value = 0;
}

export function consumePendingSeek(): number | null {
  const seek = pendingSeekTime;
  pendingSeekTime = null;
  return seek;
}

export function resetTransportSignals(): void {
  transportTime.value = 0;
  isPlaying.value = false;
  loudness.value = 0;
  totalTime.value = 0;
  pendingSeekTime = null;
}
