import AudioService from '../../audio/AudioService';
import { resetFocusSignals } from '../focusSignals';
import { resetEditModeSignals } from '../../workstation/editModeSignals';
import { resetWorkstationSignals } from '../../workstation/workstationSignals';
import { resetTuningSignals } from '../../workstation/scrubber/tuningSignals';

export function resetAllSignals(): void {
  const audioService = AudioService.getInstance();
  audioService.playbackService.reset();
  audioService.recordingService.reset();
  audioService.trackService.reset();
  audioService.classificationService.reset();
  resetFocusSignals();
  resetEditModeSignals();
  resetWorkstationSignals();
  resetTuningSignals();
}
