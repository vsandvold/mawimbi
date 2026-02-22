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

      const dispose = effect(() => {
        const volume = trackSignals.volume.value;
        channel.volume = volume;
      });

      disposers.push(dispose);
    }

    return () => {
      for (const dispose of disposers) {
        dispose();
      }
    };
  }, [trackIds]); // audioService never changes, and can safely be omitted from dependencies
}
