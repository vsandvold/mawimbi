import * as Tone from 'tone';
import type WorkletAnalyser from './WorkletAnalyser';

// Low-latency getUserMedia constraints for recording. Disables browser
// processing (echo cancellation, noise suppression, AGC) that adds latency
// and degrades audio quality for music recording.
export const LOW_LATENCY_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

class MicrophoneService {
  private microphone: Tone.UserMedia;
  private meter: Tone.Meter;
  private workletAnalyser: WorkletAnalyser | null = null;

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

  connect(destination: Tone.ToneAudioNode | AudioNode): void {
    this.microphone.connect(destination as Tone.ToneAudioNode);
  }

  // Replace Tone.Meter with a WorkletAnalyser for loudness metering.
  // Call after the analyser has been initialized (module loaded).
  // Re-routes the microphone connection from Tone.Meter to the worklet.
  useWorkletAnalyser(analyser: WorkletAnalyser): void {
    this.microphone.disconnect(this.meter);
    this.workletAnalyser = analyser;
    this.microphone.connect(analyser.input as unknown as Tone.ToneAudioNode);
  }

  getWorkletAnalyser(): WorkletAnalyser | null {
    return this.workletAnalyser;
  }

  getLoudness(): number {
    if (this.workletAnalyser) {
      return this.workletAnalyser.getRawRms();
    }
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

export default MicrophoneService;
