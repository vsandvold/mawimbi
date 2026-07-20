import { vi, type Mock } from 'vitest';
import * as Tone from 'tone';
import EffectsChain, {
  mapEchoAmount,
  mapSpaceAmount,
  mapToneAmount,
  MAX_EFFECT_AMOUNT,
  MIN_EFFECT_AMOUNT,
} from '../EffectsChain';
import MixerService from '../MixerService';
import TrackService from '../TrackService';

// jsdom doesn't implement URL.createObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
}

type MockNode = {
  connect: Mock;
  disconnect: Mock;
  chain: Mock;
  dispose: Mock;
};

function makeMockNode(): MockNode {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
    chain: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
  };
}

function asToneNode(node: MockNode): Tone.ToneAudioNode {
  return node as unknown as Tone.ToneAudioNode;
}

function reverbInstance(index = 0) {
  return vi.mocked(Tone.Reverb).mock.results[index].value;
}

function delayInstance(index = 0) {
  return vi.mocked(Tone.FeedbackDelay).mock.results[index].value;
}

function filterInstance(index = 0) {
  return vi.mocked(Tone.Filter).mock.results[index].value;
}

describe('EffectsChain wiring', () => {
  let source: MockNode;
  let destination: MockNode;
  let chain: EffectsChain;

  beforeEach(() => {
    source = makeMockNode();
    destination = makeMockNode();
    chain = new EffectsChain(asToneNode(source), asToneNode(destination));
  });

  it('connects source directly to destination when all amounts are 0', () => {
    expect(source.chain).toHaveBeenLastCalledWith(destination);
  });

  it('creates no effect nodes while all amounts are 0', () => {
    expect(Tone.Reverb).not.toHaveBeenCalled();
    expect(Tone.FeedbackDelay).not.toHaveBeenCalled();
    expect(Tone.Filter).not.toHaveBeenCalled();
  });

  it('connects a single active effect between source and destination', () => {
    chain.setAmount('echo', 50);

    expect(source.chain).toHaveBeenLastCalledWith(delayInstance(), destination);
  });

  it('inserts effects in fixed Space → Echo → Tone order regardless of activation order', () => {
    chain.setAmount('tone', 30);
    chain.setAmount('space', 40);
    chain.setAmount('echo', 20);

    expect(source.chain).toHaveBeenLastCalledWith(
      reverbInstance(),
      delayInstance(),
      filterInstance(),
      destination,
    );
  });

  it('disconnects the node and restores the direct connection when amount returns to 0', () => {
    chain.setAmount('space', 50);
    chain.setAmount('space', 0);

    expect(reverbInstance().disconnect).toHaveBeenCalled();
    expect(source.chain).toHaveBeenLastCalledWith(destination);
  });

  it('keeps other active effects wired when one is bypassed', () => {
    chain.setAmount('space', 50);
    chain.setAmount('tone', 40);
    chain.setAmount('space', 0);

    expect(source.chain).toHaveBeenLastCalledWith(
      filterInstance(),
      destination,
    );
  });

  it('does not rewire when amount changes between two nonzero values', () => {
    chain.setAmount('space', 50);
    const rewireCount = source.chain.mock.calls.length;

    chain.setAmount('space', 80);

    expect(source.chain.mock.calls.length).toBe(rewireCount);
  });

  it('reuses the existing node when re-activated after bypass', () => {
    chain.setAmount('space', 50);
    chain.setAmount('space', 0);
    chain.setAmount('space', 30);

    expect(Tone.Reverb).toHaveBeenCalledTimes(1);
    expect(source.chain).toHaveBeenLastCalledWith(
      reverbInstance(),
      destination,
    );
  });

  it('clamps amounts above the maximum', () => {
    chain.setAmount('space', 150);

    expect(chain.getAmount('space')).toBe(MAX_EFFECT_AMOUNT);
  });

  it('clamps negative amounts to bypass', () => {
    chain.setAmount('space', 50);
    chain.setAmount('space', -5);

    expect(chain.getAmount('space')).toBe(MIN_EFFECT_AMOUNT);
    expect(source.chain).toHaveBeenLastCalledWith(destination);
  });

  it('reports amounts through the plain getter', () => {
    expect(chain.getAmount('echo')).toBe(MIN_EFFECT_AMOUNT);

    chain.setAmount('echo', 65);

    expect(chain.getAmount('echo')).toBe(65);
  });

  it('disposes created effect nodes', () => {
    chain.setAmount('space', 50);
    chain.setAmount('echo', 50);

    chain.dispose();

    expect(reverbInstance().dispose).toHaveBeenCalled();
    expect(delayInstance().dispose).toHaveBeenCalled();
  });
});

describe('macro parameter application', () => {
  let chain: EffectsChain;

  beforeEach(() => {
    chain = new EffectsChain(
      asToneNode(makeMockNode()),
      asToneNode(makeMockNode()),
    );
  });

  it('ramps reverb wet to the mapped value when space amount changes', () => {
    chain.setAmount('space', 50);

    expect(reverbInstance().wet.rampTo).toHaveBeenCalledWith(
      mapSpaceAmount(50).wet,
      expect.any(Number),
    );
  });

  it('ramps delay wet and feedback to the mapped values when echo amount changes', () => {
    chain.setAmount('echo', 70);

    const { wet, feedback } = mapEchoAmount(70);
    expect(delayInstance().wet.rampTo).toHaveBeenCalledWith(
      wet,
      expect.any(Number),
    );
    expect(delayInstance().feedback.rampTo).toHaveBeenCalledWith(
      feedback,
      expect.any(Number),
    );
  });

  it('ramps filter cutoff to the mapped value when tone amount changes', () => {
    chain.setAmount('tone', 60);

    expect(filterInstance().frequency.rampTo).toHaveBeenCalledWith(
      mapToneAmount(60).cutoffHz,
      expect.any(Number),
    );
  });
});

describe('macro mapping', () => {
  function sweepAmounts(): number[] {
    const amounts = [];
    for (
      let amount = MIN_EFFECT_AMOUNT;
      amount <= MAX_EFFECT_AMOUNT;
      amount++
    ) {
      amounts.push(amount);
    }
    return amounts;
  }

  it('space wet increases monotonically over the full range', () => {
    const values = sweepAmounts().map((amount) => mapSpaceAmount(amount).wet);

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('space wet stays within the normal range', () => {
    for (const amount of sweepAmounts()) {
      const { wet } = mapSpaceAmount(amount);
      expect(wet).toBeGreaterThanOrEqual(0);
      expect(wet).toBeLessThanOrEqual(1);
    }
  });

  it('echo wet and feedback increase monotonically over the full range', () => {
    const values = sweepAmounts().map((amount) => mapEchoAmount(amount));

    for (let i = 1; i < values.length; i++) {
      expect(values[i].wet).toBeGreaterThan(values[i - 1].wet);
      expect(values[i].feedback).toBeGreaterThan(values[i - 1].feedback);
    }
  });

  it('echo feedback stays below the runaway threshold', () => {
    for (const amount of sweepAmounts()) {
      const { feedback } = mapEchoAmount(amount);
      expect(feedback).toBeGreaterThanOrEqual(0);
      expect(feedback).toBeLessThan(1);
    }
  });

  it('tone cutoff decreases monotonically (more amount = darker)', () => {
    const values = sweepAmounts().map(
      (amount) => mapToneAmount(amount).cutoffHz,
    );

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it('tone cutoff stays within the audible band', () => {
    for (const amount of sweepAmounts()) {
      const { cutoffHz } = mapToneAmount(amount);
      expect(cutoffHz).toBeGreaterThan(20);
      expect(cutoffHz).toBeLessThan(20000);
    }
  });
});

describe('per-track isolation', () => {
  let mixer: MixerService;

  beforeEach(() => {
    mixer = new MixerService();
    mixer.createChannel('track-1', {} as AudioBuffer);
    mixer.createChannel('track-2', {} as AudioBuffer);
  });

  it('setting an effect on one channel leaves the other channel unwired', () => {
    mixer.retrieveChannel('track-1')!.setEffectAmount('space', 60);

    expect(Tone.Reverb).toHaveBeenCalledTimes(1);

    const otherPlayer = vi.mocked(Tone.Player).mock.results[1].value;
    const otherChannel = vi.mocked(Tone.Channel).mock.results[1].value;
    expect(otherPlayer.chain).toHaveBeenLastCalledWith(otherChannel);
  });

  it('reports effect amounts per channel', () => {
    mixer.retrieveChannel('track-1')!.setEffectAmount('space', 60);

    expect(mixer.retrieveChannel('track-1')!.getEffectAmount('space')).toBe(60);
    expect(mixer.retrieveChannel('track-2')!.getEffectAmount('space')).toBe(0);
  });

  it('disposes the effects chain when the channel is deleted', () => {
    mixer.retrieveChannel('track-1')!.setEffectAmount('space', 60);

    mixer.deleteChannel('track-1');

    expect(reverbInstance().dispose).toHaveBeenCalled();
  });
});

describe('effect signal → mixer sync', () => {
  function mockAudioBuffer(): AudioBuffer {
    const channelData = new Float32Array(100).fill(0.2);
    return {
      numberOfChannels: 1,
      length: 100,
      sampleRate: 44100,
      duration: 100 / 44100,
      getChannelData: vi.fn().mockReturnValue(channelData),
    } as unknown as AudioBuffer;
  }

  let service: TrackService;

  beforeEach(() => {
    vi.mocked(Tone.context.decodeAudioData).mockResolvedValue(
      mockAudioBuffer(),
    );
    service = new TrackService(Tone.context);
  });

  it('creates effect signals defaulting to bypass', async () => {
    const { trackId } = await service.createTrack(new ArrayBuffer(8));

    const signals = service.getSignals(trackId)!;
    expect(signals.effects.space.value).toBe(MIN_EFFECT_AMOUNT);
    expect(signals.effects.echo.value).toBe(MIN_EFFECT_AMOUNT);
    expect(signals.effects.tone.value).toBe(MIN_EFFECT_AMOUNT);
  });

  it('syncs effect signal writes to the mixer channel', async () => {
    const { trackId } = await service.createTrack(new ArrayBuffer(8));

    service.getSignals(trackId)!.effects.space.value = 42;

    expect(service.retrieveChannel(trackId)!.getEffectAmount('space')).toBe(42);
  });

  it('syncs each effect independently', async () => {
    const { trackId } = await service.createTrack(new ArrayBuffer(8));
    const channel = service.retrieveChannel(trackId)!;

    service.getSignals(trackId)!.effects.echo.value = 30;
    service.getSignals(trackId)!.effects.tone.value = 70;

    expect(channel.getEffectAmount('space')).toBe(MIN_EFFECT_AMOUNT);
    expect(channel.getEffectAmount('echo')).toBe(30);
    expect(channel.getEffectAmount('tone')).toBe(70);
  });

  it('affects only the written track when several tracks exist', async () => {
    const first = await service.createTrack(new ArrayBuffer(8));
    const second = await service.createTrack(new ArrayBuffer(8));

    service.getSignals(first.trackId)!.effects.space.value = 55;

    expect(
      service.retrieveChannel(second.trackId)!.getEffectAmount('space'),
    ).toBe(MIN_EFFECT_AMOUNT);
  });

  it('stops syncing after signals are disposed', async () => {
    const { trackId } = await service.createTrack(new ArrayBuffer(8));
    const signals = service.getSignals(trackId)!;

    service.disposeSignals(trackId);
    signals.effects.space.value = 42;

    expect(service.retrieveChannel(trackId)!.getEffectAmount('space')).toBe(
      MIN_EFFECT_AMOUNT,
    );
  });
});
