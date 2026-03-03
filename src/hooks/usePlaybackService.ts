// usePlaybackService — React hook that bridges PlaybackService signals to components.
//
// Components read reactive state (via getters) and call action callbacks.
// Signals are never exposed directly — this hook is the boundary between
// the signal-based service layer and the React component layer.
//
// Getters are lazy: a component only subscribes to the signals it actually
// reads during render. Getters also work in imperative contexts (event
// handlers, RAF callbacks) where they return the current value without
// subscribing.

import { useSignals } from '@preact/signals-react/runtime';
import { useContext } from 'react';
import { AudioServiceContext } from './useAudioService';
import { type PlaybackState } from '../services/PlaybackService';

export function usePlaybackService() {
  useSignals();
  const service = useContext(AudioServiceContext).playbackService;

  return {
    // --- Reactive state (getters → lazy signal subscription) ---

    get playbackState(): PlaybackState {
      return service.playbackState.value;
    },
    get isPlaying(): boolean {
      return service.isPlaying.value;
    },
    get isStopped(): boolean {
      return service.playbackState.value === 'stopped';
    },
    get transportTime(): number {
      return service.transportTime.value;
    },
    get totalTime(): number {
      return service.totalTime.value;
    },
    get loudness(): number {
      return service.loudness.value;
    },

    // --- State machine transitions ---

    play: () => service.play(),
    pause: () => service.pause(),
    stop: () => service.stop(),
    togglePlayback: () => service.togglePlayback(),
    rewind: () => service.rewind(),
    seekTo: (time: number) => service.seekTo(time),

    // --- Engine access (for animation loops and workflow coordination) ---

    getEngineTime: () => service.getEngineTime(),
    setEngineTime: (time: number) => service.setEngineTime(time),
    setTransportTime: (time: number) => {
      service.transportTime.value = time;
    },
    setTotalTime: (time: number) => {
      service.totalTime.value = time;
    },
    setLoudness: (value: number) => {
      service.loudness.value = value;
    },

    // --- Reset ---

    reset: () => service.reset(),
  };
}
