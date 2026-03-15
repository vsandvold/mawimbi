import { useTrackService } from '../../features/tracks/useTrackService';
import { type TrackId } from '../../features/tracks/types';

const DEFAULT_VOLUME = 100;
const PERCENT_DIVISOR = 100;

export function useTrackVolume(trackId: TrackId) {
  const trackHook = useTrackService();
  const volume = trackHook.getSignals(trackId)?.volume.value ?? DEFAULT_VOLUME;
  const opacity = convertToOpacity(volume);

  return { volume, opacity };
}

function convertToOpacity(value: number): string {
  return (value / PERCENT_DIVISOR).toFixed(2);
}
