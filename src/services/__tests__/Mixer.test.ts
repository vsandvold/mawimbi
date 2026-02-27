import { vi } from 'vitest';
import * as Tone from 'tone';
import Mixer, { AudioChannel } from '../Mixer';

let mixer: Mixer;

beforeEach(() => {
  mixer = new Mixer();
});

describe('constructor', () => {
  it('creates a Tone.Meter with normalRange and smoothing', () => {
    expect(Tone.Meter).toHaveBeenCalledWith({
      normalRange: true,
      smoothing: 0.8,
    });
  });

  it('connects Tone.Destination to the meter', () => {
    const destination = vi.mocked(Tone.getDestination).mock.results[0].value;
    expect(destination.connect).toHaveBeenCalled();
  });
});

describe('getLoudness', () => {
  it('returns 0 when meter value is 0', () => {
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;
    meterInstance.getValue.mockReturnValue(0);

    expect(mixer.getLoudness()).toBe(0);
  });

  it('returns 1 when meter value is 1', () => {
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;
    meterInstance.getValue.mockReturnValue(1);

    expect(mixer.getLoudness()).toBe(1);
  });

  it('applies power curve to meter value', () => {
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;
    meterInstance.getValue.mockReturnValue(0.5);

    const expected = Math.pow(0.5, 0.6);
    expect(mixer.getLoudness()).toBeCloseTo(expected);
  });

  it('clamps negative meter values to 0', () => {
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;
    meterInstance.getValue.mockReturnValue(-0.5);

    expect(mixer.getLoudness()).toBe(0);
  });

  it('returns 0 when meter returns an array', () => {
    const meterInstance = vi.mocked(Tone.Meter).mock.results[0].value;
    meterInstance.getValue.mockReturnValue([0.5, 0.6] as unknown as number);

    expect(mixer.getLoudness()).toBe(0);
  });
});

describe('createChannel', () => {
  it('creates a Tone.Player synced to transport', () => {
    const audioBuffer = {} as AudioBuffer;

    mixer.createChannel('track-1', audioBuffer);

    expect(Tone.Player).toHaveBeenCalledWith(audioBuffer);
    // Player().sync().start(0)
    const playerInstance = vi.mocked(Tone.Player).mock.results[0].value;
    expect(playerInstance.sync).toHaveBeenCalled();
    expect(playerInstance.start).toHaveBeenCalledWith(0, 0);
  });

  it('creates a Tone.Channel', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);

    expect(Tone.Channel).toHaveBeenCalled();
  });

  it('creates a Tone.Analyser with FFT type and no smoothing', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);

    expect(Tone.Analyser).toHaveBeenCalledWith({
      type: 'fft',
      size: 2048,
      smoothing: 0,
    });
  });

  it('chains player through channel and analyser to destination', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);

    const playerInstance = vi.mocked(Tone.Player).mock.results[0].value;
    const channelInstance = vi.mocked(Tone.Channel).mock.results[0].value;
    const analyserInstance = vi.mocked(Tone.Analyser).mock.results[0].value;
    const destination = vi
      .mocked(Tone.getDestination)
      .mock.results.at(-1)!.value;
    expect(playerInstance.chain).toHaveBeenCalledWith(
      channelInstance,
      analyserInstance,
      destination,
    );
  });

  it('starts player at given transport time and audio offset', () => {
    mixer.createChannel('track-1', {} as AudioBuffer, 0, 5.0, 0.03);

    const playerInstance = vi.mocked(Tone.Player).mock.results[0].value;
    expect(playerInstance.start).toHaveBeenCalledWith(5.0, 0.03);
  });

  it('defaults startTime and audioOffset to 0', () => {
    mixer.createChannel('track-1', {} as AudioBuffer, 0);

    const playerInstance = vi.mocked(Tone.Player).mock.results[0].value;
    expect(playerInstance.start).toHaveBeenCalledWith(0, 0);
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

describe('getFrequencyData', () => {
  it('returns frequency data for existing track', () => {
    mixer.createChannel('track-1', {} as AudioBuffer);

    const data = mixer.getFrequencyData('track-1');

    expect(data).toBeInstanceOf(Float32Array);
    expect(data!.length).toBe(2048);
  });

  it('returns undefined for unknown track ID', () => {
    expect(mixer.getFrequencyData('nonexistent')).toBeUndefined();
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
  let toneChannel: Tone.Channel;
  let toneAnalyser: Tone.Analyser;
  let audioChannel: AudioChannel;

  beforeEach(() => {
    toneChannel = {
      mute: false,
      solo: false,
      volume: { rampTo: vi.fn() },
      dispose: vi.fn(),
    } as unknown as Tone.Channel;
    toneAnalyser = {
      getValue: vi.fn().mockReturnValue(new Float32Array(2048)),
      dispose: vi.fn(),
    } as unknown as Tone.Analyser;
    audioChannel = new AudioChannel('ch-1', toneChannel, toneAnalyser);
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

  describe('normalization gain', () => {
    it('adds normalization gain to slider dB at full volume', () => {
      const normGainDb = 6;
      const normalized = new AudioChannel(
        'ch-norm',
        toneChannel,
        toneAnalyser,
        normGainDb,
      );

      normalized.volume = 100;

      // slider dB at 100 = 0, so total = 0 + 6 = 6
      expect(toneChannel.volume.rampTo).toHaveBeenCalledWith(normGainDb, 0.1);
    });

    it('adds normalization gain to slider dB at mid volume', () => {
      const normGainDb = 12;
      const normalized = new AudioChannel(
        'ch-norm',
        toneChannel,
        toneAnalyser,
        normGainDb,
      );

      normalized.volume = 50;

      const sliderDb = 20 * Math.log(51 / 101);
      expect(toneChannel.volume.rampTo).toHaveBeenCalledWith(
        sliderDb + normGainDb,
        0.1,
      );
    });

    it('defaults normalization gain to 0 when not provided', () => {
      const channel = new AudioChannel('ch-default', toneChannel, toneAnalyser);

      channel.volume = 100;

      // 0 dB slider + 0 dB normalization = 0 dB
      expect(toneChannel.volume.rampTo).toHaveBeenCalledWith(0, 0.1);
    });
  });

  describe('getFrequencyData', () => {
    it('returns Float32Array from the analyser', () => {
      const data = audioChannel.getFrequencyData();

      expect(toneAnalyser.getValue).toHaveBeenCalled();
      expect(data).toBeInstanceOf(Float32Array);
    });
  });

  describe('dispose', () => {
    it('disposes the underlying Tone.Channel', () => {
      audioChannel.dispose();
      expect(toneChannel.dispose).toHaveBeenCalled();
    });

    it('disposes the underlying Tone.Analyser', () => {
      audioChannel.dispose();
      expect(toneAnalyser.dispose).toHaveBeenCalled();
    });
  });
});
