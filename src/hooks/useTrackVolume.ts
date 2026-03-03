import { useSignals } from '@preact/signals-react/runtime';
import { useTrackService } from './useAudioService';
import { type TrackId } from '../types/track';

const DEFAULT_VOLUME = 100;
const PERCENT_DIVISOR = 100;

export function useTrackVolume(trackId: TrackId) {
  useSignals();
  const trackService = useTrackService();
  const volume =
    trackService.getSignals(trackId)?.volume.value ?? DEFAULT_VOLUME;
  const opacity = convertToOpacity(volume);

  return { volume, opacity };
}

function convertToOpacity(value: number): string {
  return (value / PERCENT_DIVISOR).toFixed(2);
}
