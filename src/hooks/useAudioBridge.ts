import { useEffect } from 'react';
import { effect } from '@preact/signals-react';
import { type TrackId } from '../components/project/projectPageReducer';
import { TrackSignalStore } from '../signals/trackSignals';
import { useAudioService } from './useAudioService';

export function useAudioBridge(trackIds: TrackId[]): void {
  const audioService = useAudioService();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    for (const trackId of trackIds) {
      const trackSignals = TrackSignalStore.get(trackId);
      if (!trackSignals) continue;

      const channel = audioService.mixer.retrieveChannel(trackId);
      if (!channel) continue;

      const disposeVolume = effect(() => {
        const volume = trackSignals.volume.value;
        channel.volume = volume;
      });

      const disposeMute = effect(() => {
        channel.mute = trackSignals.mute.value;
      });

      const disposeSolo = effect(() => {
        channel.solo = trackSignals.solo.value;
      });

      disposers.push(disposeVolume, disposeMute, disposeSolo);
    }

    return () => {
      for (const dispose of disposers) {
        dispose();
      }
    };
  }, [trackIds]);
}
