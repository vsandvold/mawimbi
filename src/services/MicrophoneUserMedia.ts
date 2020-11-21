import * as Tone from 'tone';

class MicrophoneUserMedia {
  private meter: Tone.Meter;
  private microphone: Tone.UserMedia;

  constructor() {
    this.meter = new Tone.Meter();
    this.microphone = new Tone.UserMedia().connect(this.meter);
  }

  open() {
    this.microphone
      .open()
      .then(() => {
        // promise resolves when input is available
        console.log('mic open');
        // print the incoming mic levels in decibels
        setInterval(() => console.log(this.meter.getValue()), 100);
      })
      .catch((e) => {
        // promise is rejected when the user doesn't have or allow mic access
        console.log('mic not open');
      });
  }

  close() {
    console.log('mic close');
    this.microphone.close();
  }
}

export default MicrophoneUserMedia;
