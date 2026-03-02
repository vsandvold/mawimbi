import { useEffect } from 'react';
import { effect } from '@preact/signals-react';
import {
  type PlaybackState,
  consumePendingSeek,
  playbackState,
} from '../services/PlaybackMachine';
import { useAudioService } from './useAudioService';

export function useTransportBridge(): void {
  const audioService = useAudioService();

  useEffect(() => {
    let prevState: PlaybackState = playbackState.peek();

    const dispose = effect(() => {
      const state = playbackState.value;

      if (state === prevState) return;
      prevState = state;

      const seekTime = consumePendingSeek();

      if (state === 'playing') {
        if (seekTime !== null) {
          audioService.startPlayback(seekTime);
        } else {
          audioService.startPlayback();
        }
      } else if (state === 'paused') {
        if (seekTime !== null) {
          audioService.pausePlayback(seekTime);
        } else {
          audioService.pausePlayback();
        }
      } else {
        // stopped — use stopPlayback to reset transport timeline
        if (seekTime !== null) {
          audioService.stopPlayback(seekTime);
        } else {
          audioService.stopPlayback();
        }
      }
    });

    return dispose;
  }, [audioService]);
}
