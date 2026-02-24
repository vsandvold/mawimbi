import * as Tone from 'tone';

class MicrophoneUserMedia {
  // TODO: make private again
  microphone: Tone.UserMedia;

  private meter: Tone.Meter;

  constructor() {
    this.meter = new Tone.Meter();
    this.microphone = new Tone.UserMedia().connect(this.meter);
  }

  async open(): Promise<void> {
    await this.microphone.open();
  }

  close(): void {
    this.microphone.close();
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
