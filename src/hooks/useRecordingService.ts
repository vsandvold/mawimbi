// useRecordingService — React hook that bridges RecordingService signals to components.
//
// Same pattern as usePlaybackService: reactive state via getters, actions
// as callbacks. Components never see signals directly.

import { useSignals } from '@preact/signals-react/runtime';
import { useContext } from 'react';
import { AudioServiceContext } from './useAudioService';
import { type RecordingState } from '../services/RecordingService';

export function useRecordingService() {
  useSignals();
  const service = useContext(AudioServiceContext).recordingService;

  return {
    // --- Reactive state (getters → lazy signal subscription via signals accessor) ---

    get recordingState(): RecordingState {
      return service.signals.recordingState.value;
    },
    get isCountingIn(): boolean {
      return service.signals.isCountingIn.value;
    },
    get isRecording(): boolean {
      return service.signals.isRecording.value;
    },
    get isTransportLocked(): boolean {
      return service.isTransportLocked();
    },
    get isArmed(): boolean {
      return service.isArmed();
    },
    get isIdle(): boolean {
      return service.isIdle();
    },
    get isActivelyRecording(): boolean {
      return service.isActivelyRecording();
    },

    // --- State machine transitions ---

    arm: () => service.arm(),
    disarm: () => service.disarm(),
    startRecording: () => service.startRecording(),
    stopRecording: () => service.stopRecording(),
    toggleArm: () => service.toggleArm(),
    startCountIn: () => service.startCountIn(),
    stopCountIn: () => service.stopCountIn(),

    // --- Microphone management ---

    prepareMicrophone: () => service.prepareMicrophone(),
    closeMicrophone: () => service.closeMicrophone(),
    getLoudness: () => service.getLoudness(),
    getMicrophoneSource: () => service.getMicrophoneSource(),

    // --- Overdub recording ---

    startOverdubRecording: () => service.startOverdubRecording(),
    stopOverdubRecording: () => service.stopOverdubRecording(),
    isOverdubRecording: () => service.isOverdubRecording(),
    getRecordingStartTime: () => service.getRecordingStartTime(),

    // --- Reset ---

    reset: () => service.reset(),
  };
}
