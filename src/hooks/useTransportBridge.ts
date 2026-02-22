import { useEffect } from 'react';
import { effect } from '@preact/signals-react';
import { consumePendingSeek, isPlaying } from '../signals/transportSignals';
import { useAudioService } from './useAudioService';

export function useTransportBridge(): void {
  const audioService = useAudioService();

  useEffect(() => {
    let prevPlaying = isPlaying.peek();

    const dispose = effect(() => {
      const playing = isPlaying.value;

      if (playing === prevPlaying) return;
      prevPlaying = playing;

      const seekTime = consumePendingSeek();

      if (playing) {
        if (seekTime !== null) {
          audioService.startPlayback(seekTime);
        } else {
          audioService.startPlayback();
        }
      } else {
        if (seekTime !== null) {
          audioService.pausePlayback(seekTime);
        } else {
          audioService.pausePlayback();
        }
      }
    });

    return dispose;
  }, []); // audioService never changes, and can safely be omitted from dependencies
}
