import * as Tone from 'tone';

const SMOOTHING = 0.8;
const POWER_CURVE_EXPONENT = 0.6;
const FFT_SIZE = 2048;

class Mixer {
  private audioChannelRepository: AudioChannelRepository;
  private meter: Tone.Meter;

  constructor() {
    this.audioChannelRepository = new AudioChannelRepository();
    this.meter = new Tone.Meter({ normalRange: true, smoothing: SMOOTHING });
    Tone.getDestination().connect(this.meter);
  }

  getLoudness(): number {
    const value = this.meter.getValue();
    const clamped = typeof value === 'number' ? Math.max(0, value) : 0;
    return Math.pow(clamped, POWER_CURVE_EXPONENT);
  }

  createChannel(
    trackId: string,
    audioBuffer: AudioBuffer,
    normalizationGainDb = 0,
    startTime = 0,
    audioOffset = 0,
  ): void {
    const player = new Tone.Player(audioBuffer)
      .sync()
      .start(startTime, audioOffset);
    const channel = new Tone.Channel();
    const analyser = new Tone.Analyser({
      type: 'fft',
      size: FFT_SIZE,
      smoothing: 0,
    });
    player.chain(channel, analyser, Tone.getDestination());
    this.audioChannelRepository.add(
      new AudioChannel(trackId, channel, analyser, normalizationGainDb),
    );
  }

  getFrequencyData(trackId: string): Float32Array | undefined {
    return this.audioChannelRepository.get(trackId)?.getFrequencyData();
  }

  getCombinedFrequencyData(): Float32Array | null {
    const channels = this.audioChannelRepository.getAll();
    const hasSoloChannels = this.hasSoloChannels();
    let combined: Float32Array | null = null;

    for (const channel of channels) {
      if (this.isChannelMuted(channel, hasSoloChannels)) continue;
      const data = channel.getFrequencyData();
      if (!combined) {
        combined = new Float32Array(data);
      } else {
        for (let i = 0; i < data.length; i++) {
          if (data[i] > combined[i]) combined[i] = data[i];
        }
      }
    }

    return combined;
  }

  retrieveChannel(trackId: string): AudioChannel | undefined {
    return this.audioChannelRepository.get(trackId);
  }

  deleteChannel(trackId: string): void {
    const channelToDelete = this.audioChannelRepository.remove(trackId);
    channelToDelete?.dispose();
  }

  getMutedChannels(): string[] {
    // TODO: use Tone.Channel.muted()?
    const hasSoloChannels = this.hasSoloChannels();
    return this.audioChannelRepository
      .getAll()
      .filter((channel) => this.isChannelMuted(channel, hasSoloChannels))
      .map(({ id }) => id);
  }

  private hasSoloChannels(): boolean {
    const soloChannels = this.audioChannelRepository
      .getAll()
      .filter((channel) => channel.solo);
    return soloChannels.length > 0;
  }

  private isChannelMuted(
    channel: AudioChannel,
    hasSoloChannels: boolean,
  ): boolean {
    return channel.mute || (hasSoloChannels && !channel.solo);
  }
}

export class AudioChannel {
  id: string;
  private channel: Tone.Channel;
  private analyser: Tone.Analyser;
  private normalizationGainDb: number;

  constructor(
    id: string,
    channel: Tone.Channel,
    analyser: Tone.Analyser,
    normalizationGainDb = 0,
  ) {
    this.id = id;
    this.channel = channel;
    this.analyser = analyser;
    this.normalizationGainDb = normalizationGainDb;
  }

  getFrequencyData(): Float32Array {
    return this.analyser.getValue() as Float32Array;
  }

  dispose(): void {
    this.channel.dispose();
    this.analyser.dispose();
  }

  get mute(): boolean {
    return this.channel.mute;
  }

  set mute(mute: boolean) {
    this.channel.mute = mute;
  }

  get solo(): boolean {
    return this.channel.solo;
  }

  set solo(solo: boolean) {
    this.channel.solo = solo;
  }

  set volume(volume: number) {
    const sliderDb = this.convertToDecibel(volume);
    this.channel.volume.rampTo(sliderDb + this.normalizationGainDb, 0.1);
  }

  private convertToDecibel(value: number): number {
    return 20 * Math.log((value + 1) / 101);
  }
}

class AudioChannelRepository {
  private audioChannels: AudioChannel[];

  constructor() {
    this.audioChannels = [];
  }

  add(channel: AudioChannel): void {
    this.audioChannels.push(channel);
  }

  get(id: string): AudioChannel | undefined {
    return this.audioChannels.find((channel) => channel.id === id);
  }

  getAll(): AudioChannel[] {
    return this.audioChannels;
  }

  remove(id: string): AudioChannel | undefined {
    const channelToRemove = this.get(id);
    if (channelToRemove) {
      this.audioChannels = this.audioChannels.filter(
        (channel) => channel !== channelToRemove,
      );
    }
    return channelToRemove;
  }
}

export default Mixer;
