import { vi } from 'vitest';
import * as Tone from 'tone';
import Mixer, { AudioChannel } from '../Mixer';

let mixer: Mixer;

beforeEach(() => {
  mixer = new Mixer();
});

describe('createChannel', () => {
  it('creates a Tone.Player synced to transport', () => {
    const audioBuffer = {} as AudioBuffer;

    mixer.createChannel('track-1', audioBuffer);

    expect(Tone.Player).toHaveBeenCalledWith(audioBuffer);
    // Player().sync().start(0)
    const playerInstance = vi.mocked(Tone.Player).mock.results[0].value;
    expect(playerInstance.sync).toHaveBeenCalled();
    expect(playerInstance.start).toHaveBeenCalledWith(0);
  });

  it('creates a Tone.Channel routed to destination', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);

    expect(Tone.Channel).toHaveBeenCalled();
    const channelInstance = vi.mocked(Tone.Channel).mock.results[0].value;
    expect(channelInstance.toDestination).toHaveBeenCalled();
  });

  it('chains the player to the channel', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);

    const playerInstance = vi.mocked(Tone.Player).mock.results[0].value;
    const channelInstance = vi.mocked(Tone.Channel).mock.results[0].value;
    expect(playerInstance.chain).toHaveBeenCalledWith(channelInstance);
  });
});

describe('retrieveChannel', () => {
  it('returns the created channel', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);

    const channel = mixer.retrieveChannel('track-1');

    expect(channel).toBeDefined();
    expect(channel?.id).toBe('track-1');
  });

  it('returns undefined for unknown track ID', () => {
    expect(mixer.retrieveChannel('nonexistent')).toBeUndefined();
  });
});

describe('deleteChannel', () => {
  it('removes the channel and disposes it', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);
    const channel = mixer.retrieveChannel('track-1')!;
    const disposeSpy = vi.spyOn(channel, 'dispose');

    mixer.deleteChannel('track-1');

    expect(disposeSpy).toHaveBeenCalled();
    expect(mixer.retrieveChannel('track-1')).toBeUndefined();
  });

  it('does nothing when deleting unknown track ID', () => {
    // Should not throw
    mixer.deleteChannel('nonexistent');
  });
});

describe('getMutedChannels', () => {
  it('returns empty array when no channels exist', () => {
    expect(mixer.getMutedChannels()).toEqual([]);
  });

  it('returns IDs of explicitly muted channels', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);
    mixer.createChannel('track-2', {} as AudioBuffer);

    const ch1 = mixer.retrieveChannel('track-1')!;
    ch1.mute = true;

    expect(mixer.getMutedChannels()).toEqual(['track-1']);
  });

  it('mutes non-solo channels when any channel is solo', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);
    mixer.createChannel('track-2', {} as AudioBuffer);
    mixer.createChannel('track-3', {} as AudioBuffer);

    const ch2 = mixer.retrieveChannel('track-2')!;
    ch2.solo = true;

    const muted = mixer.getMutedChannels();
    expect(muted).toContain('track-1');
    expect(muted).toContain('track-3');
    expect(muted).not.toContain('track-2');
  });

  it('includes muted solo channels as muted', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);
    mixer.createChannel('track-2', {} as AudioBuffer);

    const ch1 = mixer.retrieveChannel('track-1')!;
    ch1.solo = true;
    ch1.mute = true;

    const muted = mixer.getMutedChannels();
    // track-1 is muted (explicit mute overrides solo)
    expect(muted).toContain('track-1');
    // track-2 is muted (not solo, while solo channels exist)
    expect(muted).toContain('track-2');
  });

  it('returns no muted channels when all are unmuted and none solo', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);
    mixer.createChannel('track-2', {} as AudioBuffer);

    expect(mixer.getMutedChannels()).toEqual([]);
  });
});

describe('AudioChannel', () => {
  let toneChannel: any;
  let audioChannel: AudioChannel;

  beforeEach(() => {
    toneChannel = {
      mute: false,
      solo: false,
      volume: { rampTo: vi.fn() },
      dispose: vi.fn(),
    };
    audioChannel = new AudioChannel('ch-1', toneChannel);
  });

  it('exposes the channel id', () => {
    expect(audioChannel.id).toBe('ch-1');
  });

  describe('mute', () => {
    it('gets mute state from Tone.Channel', () => {
      toneChannel.mute = true;
      expect(audioChannel.mute).toBe(true);
    });

    it('sets mute state on Tone.Channel', () => {
      audioChannel.mute = true;
      expect(toneChannel.mute).toBe(true);
    });
  });

  describe('solo', () => {
    it('gets solo state from Tone.Channel', () => {
      toneChannel.solo = true;
      expect(audioChannel.solo).toBe(true);
    });

    it('sets solo state on Tone.Channel', () => {
      audioChannel.solo = true;
      expect(toneChannel.solo).toBe(true);
    });
  });

  describe('volume', () => {
    it('ramps volume to decibel value', () => {
      audioChannel.volume = 100;

      expect(toneChannel.volume.rampTo).toHaveBeenCalledWith(
        expect.any(Number),
        0.1,
      );
    });

    it('converts percentage to decibels correctly', () => {
      // volume=100 → 20 * Math.log((100+1)/101) = 20 * Math.log(1) = 0 dB
      audioChannel.volume = 100;
      expect(toneChannel.volume.rampTo).toHaveBeenCalledWith(0, 0.1);
    });

    it('converts minimum volume to a negative dB value', () => {
      audioChannel.volume = 0;
      const expectedDb = 20 * Math.log(1 / 101);
      expect(toneChannel.volume.rampTo).toHaveBeenCalledWith(expectedDb, 0.1);
    });

    it('converts mid-range volume correctly', () => {
      audioChannel.volume = 50;
      const expectedDb = 20 * Math.log(51 / 101);
      expect(toneChannel.volume.rampTo).toHaveBeenCalledWith(expectedDb, 0.1);
    });
  });

  describe('dispose', () => {
    it('disposes the underlying Tone.Channel', () => {
      audioChannel.dispose();
      expect(toneChannel.dispose).toHaveBeenCalled();
    });
  });
});
