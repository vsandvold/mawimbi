import * as Tone from 'tone';
import MicrophoneUserMedia from './MicrophoneUserMedia';

function startAudioContext(this: any, event: Event) {
  event.preventDefault();
  event.stopPropagation();
  Tone.start()
    .then(() => this.resolve())
    .catch(() => this.reject());
  window.removeEventListener('click', startAudioContext);
}

class AudioService {
  private static instance: AudioService;

  microphone: MicrophoneUserMedia;

  private constructor() {
    this.microphone = new MicrophoneUserMedia();
  }

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  static startAudio(clickElement = window): Promise<any> {
    return new Promise((resolve, reject) => {
      clickElement.addEventListener(
        'click',
        startAudioContext.bind({ resolve, reject })
      );
    });
  }

  decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return Tone.context.decodeAudioData(arrayBuffer);
  }

  createChannel(audioBuffer: AudioBuffer): Tone.Channel {
    const channel = new Tone.Channel().toDestination();
    const player = new Tone.Player(audioBuffer).sync().start(0);
    player.chain(channel);
    return channel;
  }

  startPlayback(transportTime?: number) {
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
    Tone.Transport.start();
  }

  pausePlayback(transportTime?: number) {
    Tone.Transport.pause();
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
  }

  stopPlayback(transportTime?: number) {
    Tone.Transport.stop();
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
  }

  togglePlayback() {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
  }

  getTransportTime() {
    return Tone.Transport.seconds;
  }

  setTransportTime(transportTime: number) {
    Tone.Transport.seconds = transportTime;
  }
}

export interface AudioServiceChannel extends Tone.Channel {}

export default AudioService;
