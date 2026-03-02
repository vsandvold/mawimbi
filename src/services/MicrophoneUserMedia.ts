import * as Tone from 'tone';

class MicrophoneUserMedia {
  private microphone: Tone.UserMedia;
  private meter: Tone.Meter;

  constructor() {
    this.meter = new Tone.Meter();
    this.microphone = new Tone.UserMedia().connect(this.meter);
  }

  get source(): Tone.ToneAudioNode {
    return this.microphone;
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

  mute(): void {
    this.microphone.mute = true;
  }

  unmute(): void {
    this.microphone.mute = false;
  }
}

export default MicrophoneUserMedia;
