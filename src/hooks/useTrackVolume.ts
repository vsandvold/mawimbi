import { TrackSignalStore } from '../signals/trackSignals';
import { type TrackId } from '../components/project/projectPageReducer';

const DEFAULT_VOLUME = 100;
const PERCENT_DIVISOR = 100;

export function useTrackVolume(trackId: TrackId) {
  const volume = TrackSignalStore.get(trackId)?.volume.value ?? DEFAULT_VOLUME;
  const opacity = convertToOpacity(volume);

  return { volume, opacity };
}

function convertToOpacity(value: number): string {
  return (value / PERCENT_DIVISOR).toFixed(2);
}
