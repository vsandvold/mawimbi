import * as Tone from 'tone';

type AudioChannel = {
  id: string;
  channel: Tone.Channel;
};

class Mixer {
  private audioChannelRepository: AudioChannelRepository;

  constructor() {
    this.audioChannelRepository = new AudioChannelRepository();
  }

  createChannel(trackId: string, audioBuffer: AudioBuffer) {
    const player = new Tone.Player(audioBuffer).sync().start(0);
    const channel = new Tone.Channel().toDestination();
    player.chain(channel);
    this.audioChannelRepository.add({
      id: trackId,
      channel,
    });
  }

  retrieveChannel(trackId: string) {
    return this.audioChannelRepository.get(trackId)?.channel;
  }

  deleteChannel(trackId: string) {
    const channelToDelete = this.audioChannelRepository.remove(trackId);
    channelToDelete?.channel.dispose();
  }

  getMutedChannels() {
    const hasSoloChannels = this.hasSoloChannels();
    return this.audioChannelRepository
      .getAll()
      .filter(({ channel }) => this.isChannelMuted(channel, hasSoloChannels))
      .map(({ id }) => id);
  }

  private hasSoloChannels() {
    const soloChannels = this.audioChannelRepository
      .getAll()
      .filter(({ channel }) => channel.solo);
    return soloChannels.length > 0;
  }

  private isChannelMuted(
    channel: Tone.Channel,
    hasSoloChannels: boolean
  ): boolean {
    return channel.mute || (hasSoloChannels && !channel.solo);
  }
}

class AudioChannelRepository {
  private audioChannels: AudioChannel[];

  constructor() {
    this.audioChannels = [];
  }

  add(channel: AudioChannel) {
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
        (channel) => channel !== channelToRemove
      );
    }
    return channelToRemove;
  }
}

export default Mixer;
