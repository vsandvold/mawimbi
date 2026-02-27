import * as Tone from 'tone';

class MicrophoneUserMedia {
  private microphone: Tone.UserMedia;
  private meter: Tone.Meter;
  private analyser: Tone.Analyser;

  constructor() {
    this.meter = new Tone.Meter();
    this.analyser = new Tone.Analyser({ type: 'fft', size: 2048 });
    this.microphone = new Tone.UserMedia()
      .connect(this.meter)
      .connect(this.analyser);
  }

  get isOpen(): boolean {
    return this.microphone.state === 'started';
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

  getFrequencyData(): Float32Array {
    return this.analyser.getValue() as Float32Array;
  }

  mute(): void {
    this.microphone.mute = true;
  }

  unmute(): void {
    this.microphone.mute = false;
  }
}

export default MicrophoneUserMedia;
