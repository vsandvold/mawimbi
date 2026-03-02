// Reacts to RecordingService state changes and applies the corresponding
// transport behavior. This keeps transport-time management separate from
// the recording lifecycle — RecordingService only knows about recording
// state, and this bridge decides what happens to playback.
//
//   recording stops → pause playback, sync transport time to engine
//
// The bridge does NOT start playback when recording starts. During
// count-in, the count-in orchestrator controls playback timing (with
// lead-in delays). After count-in completes, useMicrophone triggers
// the audio engine's startOverdubRecording which starts the transport.

import { useEffect } from 'react';
import { effect } from '@preact/signals-react';
import { pause, transportTime } from '../services/PlaybackService';
import {
  type RecordingState,
  recordingState,
} from '../services/RecordingService';
import { useAudioService } from './useAudioService';

export function useRecordingTransportBridge(): void {
  const audioService = useAudioService();

  useEffect(() => {
    let prevState: RecordingState = recordingState.peek();

    const dispose = effect(() => {
      const state = recordingState.value;

      if (state === prevState) return;
      const from = prevState;
      prevState = state;

      if (state === 'idle' && from === 'recording') {
        // Recording just stopped — pause playback at the current position
        // so the user can immediately press play to hear the recording in
        // context (standard DAW behavior).
        pause();
        transportTime.value = audioService.getTransportTime();
      }
    });

    return dispose;
  }, [audioService]);
}
