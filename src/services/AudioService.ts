import { AudioContext } from 'standardized-audio-context';
import StartAudioContext from 'startaudiocontext';
import Tone, { Channel } from 'tone';

class AudioService {
  static startAudio(): Promise<any> {
    // FIXME: debug standardized-audio-context
    // AudioService.initAudioContext();
    return StartAudioContext(Tone.context);
  }

  static initAudioContext(): void {
    // Overrides Tone.context with a more updated version from standardized-audio-context
    const audioContext = new AudioContext();
    Tone.setContext(audioContext);
  }

  static async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return await Tone.context.decodeAudioData(arrayBuffer);
  }

  static createChannel(audioBuffer: AudioBuffer): Channel {
    const channel = new Tone.Channel().toMaster();
    const player = new Tone.Player(audioBuffer).sync().start(0);
    player.chain(channel);
    return channel;
  }

  static togglePlayback() {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
  }
}

export default AudioService;
