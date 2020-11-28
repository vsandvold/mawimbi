import * as Tone from 'tone';

class MicrophoneUserMedia {
  // TODO: make private again
  microphone: Tone.UserMedia;

  private meter: Tone.Meter;
  private meterIntervalHandle?: number;

  constructor() {
    this.meter = new Tone.Meter();
    this.microphone = new Tone.UserMedia().connect(this.meter);
  }

  async open(): Promise<void> {
    await this.microphone.open();
    this.meterIntervalHandle = window.setInterval(
      () => console.log(this.meter.getValue()),
      100
    );
  }

  close() {
    clearInterval(this.meterIntervalHandle);
    this.microphone.close();
  }

  mute() {
    this.microphone.mute = true;
  }

  unmute() {
    this.microphone.mute = false;
  }
}

export default MicrophoneUserMedia;
