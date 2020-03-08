import { AudioContext } from 'standardized-audio-context';
import StartAudioContext from 'startaudiocontext';
import Tone from 'tone';

class AudioService {
  static startAudio() {
    // FIXME: debug standardized-audio-context
    // AudioService.initAudioContext();
    return StartAudioContext(Tone.context);
  }

  static initAudioContext() {
    // Overrides Tone.context with a more updated version from standardized-audio-context
    const audioContext = new AudioContext();
    Tone.setContext(audioContext);
  }
}

export default AudioService;
