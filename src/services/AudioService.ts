import * as Tone from 'tone';
import { v4 as uuidv4 } from 'uuid';
import MicrophoneUserMedia from './MicrophoneUserMedia';
import Mixer from './Mixer';

function startAudioContext(this: any, event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  Tone.start()
    .then(() => this.resolve())
    .catch(() => this.reject());
  window.removeEventListener('click', startAudioContext);
}

type AudioSource = {
  id: string;
  audioBuffer: AudioBuffer;
};

class AudioService {
  microphone: MicrophoneUserMedia;
  mixer: Mixer;

  private static instance: AudioService;
  private audioSourceRepository: AudioSourceRepository;

  private constructor() {
    this.audioSourceRepository = new AudioSourceRepository();
    this.microphone = new MicrophoneUserMedia();
    this.mixer = new Mixer();
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

  createTrack(arrayBuffer: ArrayBuffer): Promise<string> {
    return Tone.context.decodeAudioData(arrayBuffer).then((audioBuffer) => {
      const trackId = uuidv4();
      this.audioSourceRepository.add({
        id: trackId,
        audioBuffer,
      });
      this.mixer.createChannel(trackId, audioBuffer);
      return trackId;
    });
  }

  retrieveAudioBuffer(trackId: string): AudioBuffer | undefined {
    return this.audioSourceRepository.get(trackId)?.audioBuffer;
  }

  startPlayback(transportTime?: number): void {
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
    Tone.Transport.start();
  }

  pausePlayback(transportTime?: number): void {
    Tone.Transport.pause();
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
  }

  stopPlayback(transportTime?: number): void {
    Tone.Transport.stop();
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
  }

  togglePlayback(): void {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
  }

  getTransportTime(): number {
    return Tone.Transport.seconds;
  }

  setTransportTime(transportTime: number): void {
    Tone.Transport.seconds = transportTime;
  }

  getTotalTime(): number {
    return this.audioSourceRepository
      .getAll()
      .map((source) => source.audioBuffer.duration)
      .reduce((prev, curr) => (prev >= curr ? prev : curr), 0);
  }
}

class AudioSourceRepository {
  private audioSources: AudioSource[];

  constructor() {
    this.audioSources = [];
  }

  add(source: AudioSource): void {
    this.audioSources.push(source);
  }

  get(id: string): AudioSource | undefined {
    return this.audioSources.find((source) => source.id === id);
  }

  getAll(): AudioSource[] {
    return this.audioSources;
  }
}

export { AudioChannel } from './Mixer';

export default AudioService;
