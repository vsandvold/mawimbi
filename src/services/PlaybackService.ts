// PlaybackService — owns playback state and transport time signals.
//
// State machine: stopped → playing ⇄ paused → stopped
//
// Models the transport lifecycle used by music apps like GarageBand.
// Other components read state via signals and send commands through
// the public methods — they never manipulate transport state directly.

import { signal } from '@preact/signals-react';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export type PlaybackTransition =
  | 'play'
  | 'pause'
  | 'stop'
  | 'rewind'
  | 'seekAndPlay';

// --- Signals owned by PlaybackService ---

export const playbackState = signal<PlaybackState>('stopped');
export const transportTime = signal(0);
export const totalTime = signal(0);
export const loudness = signal(0);

// Pending seek: set before a state transition so the transport bridge
// can pick it up synchronously when the signal fires.
let pendingSeekTime: number | null = null;

// --- State machine transitions ---

export function play(): void {
  const state = playbackState.value;
  if (state === 'playing') return;

  if (state === 'stopped') {
    // When stopped at the end of the timeline, restart from the beginning
    const atEnd = isAtEndOfTimeline();
    if (atEnd) {
      pendingSeekTime = 0;
      transportTime.value = 0;
    }
  }

  // From paused: resume from current position (no seek needed)
  // From stopped: start from current transportTime
  playbackState.value = 'playing';
}

export function pause(): void {
  if (playbackState.value !== 'playing') return;
  playbackState.value = 'paused';
}

export function stop(): void {
  if (playbackState.value === 'stopped') return;
  playbackState.value = 'stopped';
}

export function togglePlayback(): void {
  if (playbackState.value === 'playing') {
    pause();
  } else {
    play();
  }
}

// Rewind: stop playback and return to the beginning of the timeline.
// In GarageBand, pressing the rewind button always goes to 0.
export function rewind(): void {
  pendingSeekTime = 0;
  playbackState.value = 'stopped';
  transportTime.value = 0;
}

// Seek to a specific time. If playing, include a pending seek so the
// transport bridge applies it before resuming.
export function seekTo(time: number): void {
  pendingSeekTime = time;
  transportTime.value = time;
}

export function consumePendingSeek(): number | null {
  const seek = pendingSeekTime;
  pendingSeekTime = null;
  return seek;
}

// --- Derived queries ---

export function isPlaying(): boolean {
  return playbackState.value === 'playing';
}

export function isPaused(): boolean {
  return playbackState.value === 'paused';
}

export function isStopped(): boolean {
  return playbackState.value === 'stopped';
}

function isAtEndOfTimeline(): boolean {
  return (
    transportTime.value.toFixed(1) === totalTime.value.toFixed(1) &&
    totalTime.value > 0
  );
}

// --- Reset (used in tests and when navigating away) ---

export function resetPlaybackService(): void {
  playbackState.value = 'stopped';
  transportTime.value = 0;
  totalTime.value = 0;
  loudness.value = 0;
  pendingSeekTime = null;
}
