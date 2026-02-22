import * as Tone from 'tone';

const SMOOTHING = 0.8;
const POWER_CURVE_EXPONENT = 0.6;

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

  createChannel(trackId: string, audioBuffer: AudioBuffer): void {
    const player = new Tone.Player(audioBuffer).sync().start(0);
    const channel = new Tone.Channel().toDestination();
    player.chain(channel);
    this.audioChannelRepository.add(new AudioChannel(trackId, channel));
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

  constructor(id: string, channel: Tone.Channel) {
    this.id = id;
    this.channel = channel;
  }

  dispose(): void {
    this.channel.dispose();
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
    this.channel.volume.rampTo(this.convertToDecibel(volume), 0.1);
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
