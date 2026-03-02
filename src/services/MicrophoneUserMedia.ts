import * as Tone from 'tone';
import FrequencyVisualizer from './FrequencyVisualizer';

class MicrophoneUserMedia {
  private microphone: Tone.UserMedia;
  private meter: Tone.Meter;
  private visualizer: FrequencyVisualizer;

  constructor() {
    this.meter = new Tone.Meter();
    this.microphone = new Tone.UserMedia().connect(this.meter);
    this.visualizer = new FrequencyVisualizer(this.microphone);
  }

  get isOpen(): boolean {
    return this.microphone.state === 'started';
  }

  get frequencyBinCount(): number {
    return this.visualizer.frequencyBinCount;
  }

  async open(): Promise<void> {
    await this.microphone.open();
  }

  close(): void {
    this.microphone.close();
  }

  connect(destination: Tone.ToneAudioNode): void {
    this.microphone.connect(destination);
  }

  getLoudness(): number {
    const value = this.meter.getValue();
    return typeof value === 'number' ? Math.max(0, value) : 0;
  }

  getVisualizationData(): Uint8Array {
    return this.visualizer.getVisualizationData();
  }

  mute(): void {
    this.microphone.mute = true;
  }

  unmute(): void {
    this.microphone.mute = false;
  }
}

export default MicrophoneUserMedia;
