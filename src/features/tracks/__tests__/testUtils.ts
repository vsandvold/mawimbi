import AudioService from '../../audio/AudioService';
import { resetFocusSignals } from '../focusSignals';
import { resetWorkstationSignals } from '../../workstation/workstationSignals';

export function resetAllSignals(): void {
  const audioService = AudioService.getInstance();
  audioService.playbackService.reset();
  audioService.recordingService.reset();
  audioService.trackService.reset();
  audioService.classificationService.reset();
  resetFocusSignals();
  resetWorkstationSignals();
}
