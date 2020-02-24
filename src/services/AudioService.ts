import { AudioContext } from 'standardized-audio-context';
import StartAudioContext from 'startaudiocontext';
import Tone from 'tone';

class AudioService {
  static initAudioContext() {
    // Overrides Tone.context with a more updated version from standardized-audio-context
    const audioContext = new AudioContext();
    Tone.setContext(audioContext);
  }

  static startAudioContext(
    userActionElement: String | null,
    runningCallback: Function
  ) {
    // Starts the Web Audio API's AudioContext on an explicit user action.
    // On iOS, the context will be started on the first valid user action on the userActionElement element
    StartAudioContext(Tone.context, userActionElement, runningCallback);
  }
}
