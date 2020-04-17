import * as Tone from 'tone';

function startAudioContext(this: any, event: Event) {
  event.preventDefault();
  event.stopPropagation();
  Tone.start()
    .then(() => this.resolve())
    .catch(() => this.reject());
  window.removeEventListener('click', startAudioContext);
}

class AudioService {
  static startAudio(clickElement = window): Promise<any> {
    return new Promise((resolve, reject) => {
      clickElement.addEventListener(
        'click',
        startAudioContext.bind({ resolve, reject })
      );
    });
  }

  static decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return Tone.context.decodeAudioData(arrayBuffer);
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

export interface AudioServiceChannel extends Tone.Channel {}

export default AudioService;
