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
  private recorder: Tone.Recorder;

  private constructor() {
    this.audioSourceRepository = new AudioSourceRepository();
    this.microphone = new MicrophoneUserMedia();
    this.mixer = new Mixer();
    // TODO: Create class
    this.recorder = new Tone.Recorder();
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

  async createTrack(arrayBuffer: ArrayBuffer): Promise<string> {
    const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
    const trackId = uuidv4();
    this.mixer.createChannel(trackId, audioBuffer);
    this.audioSourceRepository.add({
      id: trackId,
      audioBuffer,
    });
    return trackId;
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

  async startRecording(): Promise<unknown> {
    if (this.microphone.microphone.state !== 'started') {
      return Promise.reject();
    }
    // TODO: find better way to connect source
    this.microphone.microphone.connect(this.recorder);
    return await this.recorder.start();
  }

  async stopRecording(): Promise<ArrayBuffer> {
    if (this.recorder.state === 'stopped') {
      return Promise.reject();
    }
    const blob = await this.recorder.stop();
    return await blob.arrayBuffer();
  }

  isRecording(): boolean {
    return this.recorder.state === 'started';
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
