import { TrackSignalStore } from '../trackSignals';
import { resetTransportSignals } from '../transportSignals';
import { resetFocusSignals } from '../focusSignals';
import { resetWorkstationSignals } from '../workstationSignals';

export function resetAllSignals(): void {
  TrackSignalStore.reset();
  resetTransportSignals();
  resetFocusSignals();
  resetWorkstationSignals();
}
