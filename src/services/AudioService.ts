import * as Tone from 'tone';

export interface AudioServiceChannel extends Tone.Channel {}

function startAudioContext(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  Tone.start()
    .then(() => console.log('audio is ready'))
    .catch(() => console.log('failed to start audio'));
  window.removeEventListener('click', startAudioContext);
}

class AudioService {
  static startAudio(): void {
    // TODO: bind click event listener to something more convenient
    window.addEventListener('click', startAudioContext);
  }

  static async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return await Tone.context.decodeAudioData(arrayBuffer);
  }

  static createChannel(audioBuffer: AudioBuffer): Tone.Channel {
    const channel = new Tone.Channel().toDestination();
    const player = new Tone.Player(audioBuffer).sync().start(0);
    player.chain(channel);
    return channel;
  }

  static startPlayback() {
    Tone.Transport.start();
  }

  static pausePlayback() {
    Tone.Transport.pause();
  }

  static stopPlayback() {
    Tone.Transport.stop();
  }

  static togglePlayback() {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
  }

  static getTransportTime() {
    return Tone.Transport.seconds;
  }

  static setTransportTime(transportTime: number) {
    Tone.Transport.seconds = transportTime;
  }
}

export default AudioService;
