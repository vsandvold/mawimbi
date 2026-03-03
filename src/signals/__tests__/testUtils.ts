import AudioService from '../../services/AudioService';
import { resetFocusSignals } from '../focusSignals';
import { resetWorkstationSignals } from '../workstationSignals';

export function resetAllSignals(): void {
  const audioService = AudioService.getInstance();
  audioService.playbackService.reset();
  audioService.recordingService.reset();
  audioService.trackService.reset();
  resetFocusSignals();
  resetWorkstationSignals();
}
