import { vi, type Mock } from 'vitest';
import * as Tone from 'tone';
import EffectsChain, {
  DEFAULT_EFFECT_AMOUNTS,
  hashEffectAmounts,
  mapEchoAmount,
  mapSpaceAmount,
  mapToneAmount,
  MAX_EFFECT_AMOUNT,
  MIN_EFFECT_AMOUNT,
} from '../EffectsChain';
import MixerService from '../MixerService';

type MockNode = {
  connect: Mock;
  disconnect: Mock;
  chain: Mock;
  dispose: Mock;
  context: object;
};

function makeMockNode(): MockNode {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
    chain: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
    // A unique marker object, not a real Tone context — only used to
    // assert identity (`toHaveBeenCalledWith({ context: source.context })`)
    // in the "binds new effect nodes to the source's own context" test.
    context: {},
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

  // Regression test: EffectsChain.ensureNode() used to construct effect
  // nodes with no explicit `context`, so they bound to whatever
  // Tone.getContext() (the process-global current context) happened to be
  // at that moment rather than to the live track's own context. Before #554,
  // Tone.Offline() (renderTrackOffline, used by the effects-refresh/preview
  // pipeline) swapped that global context for the duration of its callback,
  // so a live effect activated while an offline render was in flight would
  // silently bind to the wrong, throwaway context — confirmed via a
  // real-Tone.js repro to throw on the subsequent source.chain(...) call and
  // leave the track permanently disconnected from the destination bus. #554
  // fixed that specific trigger (renderTrackOffline no longer touches the
  // global context at all), but this binding stays required as a general
  // guard: any other code that ever reaches for Tone.setContext() would
  // silently reintroduce the same failure mode. Passing the source node's
  // own context explicitly makes this immune to whatever the ambient global
  // context is doing.
  it("binds new effect nodes to the source node's own context, not the ambient global one", () => {
    chain.setAmount('space', 40);
    chain.setAmount('echo', 40);
    chain.setAmount('tone', 40);

    expect(Tone.Reverb).toHaveBeenCalledWith(
      expect.objectContaining({ context: source.context }),
    );
    expect(Tone.FeedbackDelay).toHaveBeenCalledWith(
      expect.objectContaining({ context: source.context }),
    );
    expect(Tone.Filter).toHaveBeenCalledWith(
      expect.objectContaining({ context: source.context }),
    );
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

  it('sets reverb wet instantly when space is first activated', () => {
    chain.setAmount('space', 50);

    expect(reverbInstance().wet.value).toBe(mapSpaceAmount(50).wet);
    expect(reverbInstance().wet.rampTo).not.toHaveBeenCalled();
  });

  it('ramps reverb wet on live changes while space is active', () => {
    chain.setAmount('space', 30);
    chain.setAmount('space', 50);

    expect(reverbInstance().wet.rampTo).toHaveBeenCalledWith(
      mapSpaceAmount(50).wet,
      expect.any(Number),
    );
  });

  it('ramps delay wet and feedback on live changes while echo is active', () => {
    chain.setAmount('echo', 30);
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

  it('ramps filter cutoff on live changes while tone is active', () => {
    chain.setAmount('tone', 30);
    chain.setAmount('tone', 60);

    expect(filterInstance().frequency.rampTo).toHaveBeenCalledWith(
      mapToneAmount(60).cutoffHz,
      expect.any(Number),
    );
  });

  it('snaps params on re-activation after bypass so stale values do not replay', () => {
    chain.setAmount('echo', 100);
    chain.setAmount('echo', 0);
    chain.setAmount('echo', 5);

    const { wet, feedback } = mapEchoAmount(5);
    expect(delayInstance().wet.value).toBe(wet);
    expect(delayInstance().feedback.value).toBe(feedback);
    expect(delayInstance().wet.rampTo).not.toHaveBeenCalled();
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

// The signal → mixer sync suite lives in TrackService.test.ts, alongside
// the harness (mockAudioBuffer, createObjectURL shim) it shares with the
// other TrackService behavior tests.

describe('hashEffectAmounts', () => {
  it('is deterministic for the same amounts', () => {
    const a = hashEffectAmounts({ space: 10, echo: 20, tone: 30 });
    const b = hashEffectAmounts({ space: 10, echo: 20, tone: 30 });

    expect(a).toBe(b);
  });

  it('differs when any amount differs', () => {
    const base = hashEffectAmounts({ space: 10, echo: 20, tone: 30 });

    expect(hashEffectAmounts({ space: 11, echo: 20, tone: 30 })).not.toBe(base);
    expect(hashEffectAmounts({ space: 10, echo: 21, tone: 30 })).not.toBe(base);
    expect(hashEffectAmounts({ space: 10, echo: 20, tone: 31 })).not.toBe(base);
  });

  it('matches DEFAULT_EFFECT_AMOUNTS for an all-bypass chain', () => {
    expect(hashEffectAmounts(DEFAULT_EFFECT_AMOUNTS)).toBe(
      hashEffectAmounts({ space: 0, echo: 0, tone: 0 }),
    );
  });
});
