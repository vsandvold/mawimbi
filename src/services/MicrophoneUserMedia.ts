import * as Tone from 'tone';

class MicrophoneUserMedia {
  private meter: Tone.Meter;
  private microphone: Tone.UserMedia;
  private meterIntervalHandle?: number;

  constructor() {
    this.meter = new Tone.Meter();
    this.microphone = new Tone.UserMedia().connect(this.meter);
  }

  open(): Promise<void> {
    return this.microphone.open().then(() => {
      this.meterIntervalHandle = window.setInterval(
        () => console.log(this.meter.getValue()),
        100
      );
    });
  }

  close() {
    this.microphone.close();
    clearInterval(this.meterIntervalHandle);
  }

  mute() {
    this.microphone.mute = true;
  }

  unmute() {
    this.microphone.mute = false;
  }
}

export default MicrophoneUserMedia;
