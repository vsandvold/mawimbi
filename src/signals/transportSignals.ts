// Backward-compatible facade over PlaybackMachine and RecordingMachine.
//
// Re-exports the canonical signals from each machine and provides computed
// boolean signals (isPlaying, isRecording) so existing consumers that read
// `.value` as a boolean continue to work unchanged.

import { computed, type ReadonlySignal } from '@preact/signals-react';
import {
  consumePendingSeek as _consumePendingSeek,
  playbackState,
  resetPlaybackMachine,
  rewind,
  togglePlayback as _togglePlayback,
} from '../services/PlaybackMachine';
import {
  isCountingIn,
  recordingState,
  resetRecordingMachine,
} from '../services/RecordingMachine';

// --- Re-export canonical signals ---

export {
  transportTime,
  totalTime,
  loudness,
} from '../services/PlaybackMachine';
export { playbackState } from '../services/PlaybackMachine';
export { isCountingIn, recordingState } from '../services/RecordingMachine';

// --- Computed boolean signals for backward compatibility ---

// Components read `isPlaying.value` as a boolean throughout the codebase.
// This computed signal derives from the playback state machine.
export const isPlaying: ReadonlySignal<boolean> = computed(
  () => playbackState.value === 'playing',
);

// Components read `isRecording.value` as a boolean. This derives from
// the recording state machine: true when armed, recording, or counting in.
// Armed counts as "recording mode active" because the UI should reflect
// that the user is in a recording workflow (e.g. showing red indicator).
export const isRecording: ReadonlySignal<boolean> = computed(
  () => recordingState.value !== 'idle' || isCountingIn.value,
);

// --- Facade functions ---

export function togglePlayback(): void {
  _togglePlayback();
}

export function stopAndRewindPlayback(): void {
  rewind();
}

export function consumePendingSeek(): number | null {
  return _consumePendingSeek();
}

export function resetTransportSignals(): void {
  resetPlaybackMachine();
  resetRecordingMachine();
}
