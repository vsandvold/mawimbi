// Recording state machine: idle → armed → recording → idle
//
// Three-state model per GitHub issue #172:
//   idle    — not recording, transport free for normal playback
//   armed   — ready to record; starts capturing on next transport play
//   recording — actively capturing audio
//
// The armed state lets users set up their recording position, arm the
// track, and then press play (or spacebar) to begin — matching the
// workflow in GarageBand and other DAWs.
//
// When recording stops, the playhead pauses at the current position
// rather than rewinding. This lets the user immediately press play to
// hear the recording in context — the standard DAW behavior.

import { signal } from '@preact/signals-react';

export type RecordingState = 'idle' | 'armed' | 'recording';

// --- Signal exposed to the UI layer ---

export const recordingState = signal<RecordingState>('idle');
export const isCountingIn = signal(false);

// --- State machine transitions ---

export function arm(): void {
  if (recordingState.value !== 'idle') return;
  recordingState.value = 'armed';
}

export function disarm(): void {
  if (recordingState.value !== 'armed') return;
  recordingState.value = 'idle';
}

export function startRecording(): void {
  if (recordingState.value !== 'armed') return;
  recordingState.value = 'recording';
}

export function stopRecording(): void {
  if (recordingState.value !== 'recording') return;
  recordingState.value = 'idle';
}

export function toggleArm(): void {
  if (recordingState.value === 'idle') {
    arm();
  } else if (recordingState.value === 'armed') {
    disarm();
  }
  // If recording, toggleArm is a no-op — use stopRecording instead
}

// --- Count-in helpers ---

export function startCountIn(): void {
  isCountingIn.value = true;
}

export function stopCountIn(): void {
  isCountingIn.value = false;
}

// --- Derived queries ---

export function isIdle(): boolean {
  return recordingState.value === 'idle';
}

export function isArmed(): boolean {
  return recordingState.value === 'armed';
}

export function isActivelyRecording(): boolean {
  return recordingState.value === 'recording';
}

// True when the transport should be locked from user playback control
// (during count-in or active recording).
export function isTransportLocked(): boolean {
  return recordingState.value === 'recording' || isCountingIn.value;
}

// --- Reset ---

export function resetRecordingMachine(): void {
  recordingState.value = 'idle';
  isCountingIn.value = false;
}
