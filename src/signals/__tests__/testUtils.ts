import { TrackSignalStore } from '../trackSignals';
import { resetTransportSignals } from '../transportSignals';
import { resetFocusSignals } from '../focusSignals';

export function resetAllSignals(): void {
  TrackSignalStore.reset();
  resetTransportSignals();
  resetFocusSignals();
}
