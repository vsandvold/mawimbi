import { vi, type Mock } from 'vitest';
import * as Tone from 'tone';
import EffectsChain, {
  DEFAULT_EFFECT_AMOUNTS,
  hashEffectAmounts,
  mapCrushAmount,
  mapEchoAmount,
  mapSpaceAmount,
  mapToneAmount,
  normalizeEffectsHash,
  MAX_EFFECT_AMOUNT,
  MIN_EFFECT_AMOUNT,
  type EffectAmounts,
} from '../EffectsChain';
import {
  ECHO_DELAY_SECONDS,
  ECHO_MAX_DELAY_SECONDS,
  resolveEchoSync,
  selectEchoDelaySeconds,
} from '../echoSync';
import renderTrackOffline, {
  renderTrackOfflineWindow,
} from '../renderTrackOffline';
import { MIN_TEMPO_CONFIDENCE } from '../../rhythm/tempo';
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

function crusherInstance(index = 0) {
  return vi.mocked(Tone.BitCrusher).mock.results[index].value;
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
    expect(Tone.BitCrusher).not.toHaveBeenCalled();
    expect(Tone.Reverb).not.toHaveBeenCalled();
    expect(Tone.FeedbackDelay).not.toHaveBeenCalled();
    expect(Tone.Filter).not.toHaveBeenCalled();
  });

  it('connects a single active effect between source and destination', () => {
    chain.setAmount('echo', 50);

    expect(source.chain).toHaveBeenLastCalledWith(delayInstance(), destination);
  });

  // Crush sits first (spec 007 Decision 5): distortion before space is the
  // conventional and better-sounding order.
  it('inserts effects in fixed Crush → Space → Echo → Tone order regardless of activation order', () => {
    chain.setAmount('tone', 30);
    chain.setAmount('space', 40);
    chain.setAmount('crush', 60);
    chain.setAmount('echo', 20);

    expect(source.chain).toHaveBeenLastCalledWith(
      crusherInstance(),
      reverbInstance(),
      delayInstance(),
      filterInstance(),
      destination,
    );
  });

  it('bypasses the crusher entirely at amount 0 and reconnects it above 0', () => {
    chain.setAmount('crush', 70);
    expect(source.chain).toHaveBeenLastCalledWith(
      crusherInstance(),
      destination,
    );

    chain.setAmount('crush', 0);

    expect(crusherInstance().disconnect).toHaveBeenCalled();
    expect(source.chain).toHaveBeenLastCalledWith(destination);
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
    chain.setAmount('crush', 40);
    chain.setAmount('space', 40);
    chain.setAmount('echo', 40);
    chain.setAmount('tone', 40);

    expect(Tone.BitCrusher).toHaveBeenCalledWith(
      expect.objectContaining({ context: source.context }),
    );
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

  it('sets crusher bits and wet instantly when crush is first activated', () => {
    chain.setAmount('crush', 50);

    const { bits, wet } = mapCrushAmount(50);
    expect(crusherInstance().bits.value).toBe(bits);
    expect(crusherInstance().wet.value).toBe(wet);
    expect(crusherInstance().bits.rampTo).not.toHaveBeenCalled();
  });

  it('ramps crusher bits and wet on live changes while crush is active', () => {
    chain.setAmount('crush', 30);
    chain.setAmount('crush', 80);

    const { bits, wet } = mapCrushAmount(80);
    expect(crusherInstance().bits.rampTo).toHaveBeenCalledWith(
      bits,
      expect.any(Number),
    );
    expect(crusherInstance().wet.rampTo).toHaveBeenCalledWith(
      wet,
      expect.any(Number),
    );
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

  it('crush bit depth decreases monotonically (more amount = coarser)', () => {
    const values = sweepAmounts().map((amount) => mapCrushAmount(amount).bits);

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it('crush bit depth stays within Tone.BitCrusher"s 1–16 range', () => {
    for (const amount of sweepAmounts()) {
      const { bits } = mapCrushAmount(amount);
      expect(bits).toBeGreaterThanOrEqual(1);
      expect(bits).toBeLessThanOrEqual(16);
    }
  });

  it('crush wet increases monotonically and stays within the normal range', () => {
    const values = sweepAmounts().map((amount) => mapCrushAmount(amount).wet);

    for (const wet of values) {
      expect(wet).toBeGreaterThanOrEqual(0);
      expect(wet).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

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

  it('setting crush on one channel leaves the other channel unwired', () => {
    mixer.retrieveChannel('track-1')!.setEffectAmount('crush', 60);

    expect(Tone.BitCrusher).toHaveBeenCalledTimes(1);
    expect(mixer.retrieveChannel('track-2')!.getEffectAmount('crush')).toBe(0);

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
  const BASE: EffectAmounts = { crush: 40, space: 10, echo: 20, tone: 30 };

  it('is deterministic for the same amounts', () => {
    expect(hashEffectAmounts(BASE)).toBe(hashEffectAmounts({ ...BASE }));
  });

  it('differs when any amount differs', () => {
    const base = hashEffectAmounts(BASE);

    for (const effectId of ['crush', 'space', 'echo', 'tone'] as const) {
      expect(
        hashEffectAmounts({ ...BASE, [effectId]: BASE[effectId] + 1 }),
      ).not.toBe(base);
    }
  });

  it('matches DEFAULT_EFFECT_AMOUNTS for an all-bypass chain', () => {
    expect(hashEffectAmounts(DEFAULT_EFFECT_AMOUNTS)).toBe(
      hashEffectAmounts({ crush: 0, space: 0, echo: 0, tone: 0 }),
    );
  });

  // A project persisted before spec 007 stores an `effects` object with no
  // `crush` field at all — the type says otherwise, but the row on disk is
  // whatever the older build wrote. Reading it as `undefined` would hash to
  // a value nothing can ever match, re-analysing every track on every load.
  it('treats an amounts object missing the newer macros as those macros at their defaults', () => {
    const legacyAmounts = { space: 10, echo: 20, tone: 30 } as EffectAmounts;

    expect(hashEffectAmounts(legacyAmounts)).toBe(
      hashEffectAmounts({ ...DEFAULT_EFFECT_AMOUNTS, ...legacyAmounts }),
    );
  });
});

// Spec 007 milestone 2 (#558). Adding Crush widens `hashEffectAmounts`'
// output from three fields to four; every spectrogram persisted by an
// earlier build carries the three-field form. Without normalizing before
// comparison, the first load under this build finds *every* stored hash
// stale and re-renders + re-analyses every track in every project — minutes
// of work, silently, for no visual change.
describe('normalizeEffectsHash', () => {
  it('maps a legacy three-field hash onto the current format with defaults for the new macros', () => {
    expect(normalizeEffectsHash('0:0:0')).toBe(
      hashEffectAmounts(DEFAULT_EFFECT_AMOUNTS),
    );
    expect(normalizeEffectsHash('50:0:0')).toBe(
      hashEffectAmounts({ ...DEFAULT_EFFECT_AMOUNTS, space: 50 }),
    );
    expect(normalizeEffectsHash('0:25:75')).toBe(
      hashEffectAmounts({ ...DEFAULT_EFFECT_AMOUNTS, echo: 25, tone: 75 }),
    );
  });

  it('leaves a current-format hash untouched', () => {
    const current = hashEffectAmounts({
      crush: 60,
      space: 10,
      echo: 20,
      tone: 30,
    });

    expect(normalizeEffectsHash(current)).toBe(current);
  });

  it('does not make a legacy hash match a non-default value of a newer macro', () => {
    expect(normalizeEffectsHash('50:0:0')).not.toBe(
      hashEffectAmounts({ ...DEFAULT_EFFECT_AMOUNTS, crush: 50, space: 50 }),
    );
  });

  it('leaves an unrecognized hash shape alone rather than guessing at it', () => {
    expect(normalizeEffectsHash('1:2')).toBe('1:2');
    expect(normalizeEffectsHash('a:b:c')).toBe('a:b:c');
  });

  // Spec 007 milestone 4 (#560) widens the hash a second time, with the
  // echo's delay time. Projects persisted between #558 and #560 carry the
  // four-field form; both legacy shapes have to normalize, or the same
  // mass-re-analysis this suite exists to prevent happens to every project
  // saved in that window.
  it('maps a four-field (pre-echo-sync) hash onto the current format', () => {
    expect(normalizeEffectsHash('0:0:0:0')).toBe(
      hashEffectAmounts(DEFAULT_EFFECT_AMOUNTS),
    );
    expect(normalizeEffectsHash('60:10:20:30')).toBe(
      hashEffectAmounts({ crush: 60, space: 10, echo: 20, tone: 30 }),
    );
  });

  it('normalizes a four-field hash to the unsynced delay time, not to some synced one', () => {
    expect(normalizeEffectsHash('0:0:40:0')).toBe(
      hashEffectAmounts({ ...DEFAULT_EFFECT_AMOUNTS, echo: 40 }, null),
    );
    expect(normalizeEffectsHash('0:0:40:0')).not.toBe(
      hashEffectAmounts(
        { ...DEFAULT_EFFECT_AMOUNTS, echo: 40 },
        { subdivision: 'quarter', bpm: 120 },
      ),
    );
  });
});

/**
 * Tempo-synced Echo — spec 007 Goal 5 / milestone 4 (#560).
 *
 * Delay time is `subdivision × 60/BPM`, resolved through one shared
 * function so the live chain, the offline tile render and the params hash
 * cannot drift apart (issue requirement 2).
 */
describe('tempo-synced echo delay time', () => {
  const BPM = 120;
  const BEAT_SECONDS = 60 / BPM;

  it.each([
    ['quarter' as const, BEAT_SECONDS],
    ['dottedEighth' as const, 0.75 * BEAT_SECONDS],
    ['eighth' as const, 0.5 * BEAT_SECONDS],
    ['eighthTriplet' as const, BEAT_SECONDS / 3],
  ])('resolves %s to k·60/BPM', (subdivision, expected) => {
    expect(selectEchoDelaySeconds({ subdivision, bpm: BPM })).toBeCloseTo(
      expected,
      10,
    );
  });

  it('falls back to the fixed default with no sync', () => {
    expect(selectEchoDelaySeconds(null)).toBe(ECHO_DELAY_SECONDS);
  });

  // The native DelayNode clamps `delayTime` to the node's `maxDelay` instead
  // of erroring, so a delay longer than the node can hold is a silent wrong
  // answer. Tone's own default maxDelay is 1s — a quarter note anywhere
  // below 60 BPM exceeds it, and essentia estimates down to 40 BPM.
  it('never resolves a delay longer than the node is built to hold', () => {
    expect(selectEchoDelaySeconds({ subdivision: 'quarter', bpm: 40 })).toBe(
      1.5,
    );
    expect(
      selectEchoDelaySeconds({ subdivision: 'quarter', bpm: 1 }),
    ).toBeLessThanOrEqual(ECHO_MAX_DELAY_SECONDS);
  });

  it('falls back to the default rather than propagating a nonsense tempo', () => {
    expect(selectEchoDelaySeconds({ subdivision: 'quarter', bpm: 0 })).toBe(
      ECHO_DELAY_SECONDS,
    );
    expect(selectEchoDelaySeconds({ subdivision: 'quarter', bpm: NaN })).toBe(
      ECHO_DELAY_SECONDS,
    );
  });

  describe('resolveEchoSync', () => {
    const CONFIDENT = { bpm: 120, confidence: 3.5 };

    it('pairs the subdivision with a confident estimate', () => {
      expect(resolveEchoSync('eighth', CONFIDENT)).toEqual({
        subdivision: 'eighth',
        bpm: 120,
      });
    });

    it('is null with no subdivision committed', () => {
      expect(resolveEchoSync(undefined, CONFIDENT)).toBeNull();
    });

    // Gated on the same `selectConfidentTempo` the drawer's BPM badge uses,
    // so the badge and the echo can never disagree about whether this track
    // has a tempo (kb/decisions.md 2026-07-25, one product-wide threshold).
    it('is null when the estimate is not confident enough to act on', () => {
      expect(
        resolveEchoSync('eighth', {
          bpm: 120,
          confidence: MIN_TEMPO_CONFIDENCE - 0.01,
        }),
      ).toBeNull();
      expect(resolveEchoSync('eighth', undefined)).toBeNull();
    });
  });
});

describe('tempo-synced echo in the live chain', () => {
  let source: MockNode;
  let chain: EffectsChain;

  beforeEach(() => {
    source = makeMockNode();
    chain = new EffectsChain(asToneNode(source), asToneNode(makeMockNode()));
  });

  it('builds the delay node with the synced delay time', () => {
    chain.setEchoSync({ subdivision: 'dottedEighth', bpm: 120 });
    chain.setAmount('echo', 50);

    expect(delayInstance().delayTime.value).toBeCloseTo(0.375, 10);
  });

  // Room for a quarter note at any tempo the estimator produces — see
  // ECHO_MAX_DELAY_SECONDS. Asserted on the constructor because `maxDelay`
  // is fixed when the native node is created and cannot be raised later.
  it('builds the delay node with headroom for the longest synced delay', () => {
    chain.setAmount('echo', 50);

    expect(Tone.FeedbackDelay).toHaveBeenCalledWith(
      expect.objectContaining({ maxDelay: ECHO_MAX_DELAY_SECONDS }),
    );
  });

  // Spec 007 Decision 5: a delay-time *ramp* pitch-warps the echoes (#492's
  // reason for fixing the constant), but a discrete subdivision commit may
  // snap it — "character params are fixed *during* interaction; discrete
  // commits may snap them".
  it('snaps the delay time on a later sync change, never ramps it', () => {
    chain.setAmount('echo', 50);

    chain.setEchoSync({ subdivision: 'eighth', bpm: 120 });

    expect(delayInstance().delayTime.value).toBeCloseTo(0.25, 10);
    expect(delayInstance().delayTime.rampTo).not.toHaveBeenCalled();
  });

  it('restores the fixed default when sync is turned off', () => {
    chain.setAmount('echo', 50);
    chain.setEchoSync({ subdivision: 'eighthTriplet', bpm: 90 });

    chain.setEchoSync(null);

    expect(delayInstance().delayTime.value).toBe(ECHO_DELAY_SECONDS);
  });

  it('does not create the delay node just to record a sync', () => {
    chain.setEchoSync({ subdivision: 'quarter', bpm: 120 });

    expect(Tone.FeedbackDelay).not.toHaveBeenCalled();
  });

  it('leaves the delay time alone when the resolved delay has not changed', () => {
    chain.setAmount('echo', 50);
    chain.setEchoSync({ subdivision: 'quarter', bpm: 120 });
    const delay = delayInstance();
    const sentinel = -1;
    delay.delayTime.value = sentinel;

    chain.setEchoSync({ subdivision: 'quarter', bpm: 120 });

    expect(delay.delayTime.value).toBe(sentinel);
  });
});

/**
 * The offline render and the live chain must agree on the delay time — the
 * spectrogram is a claim about what the track sounds like, and a tile drawn
 * from a different delay than the audio uses is a lie the user can hear but
 * not see (issue requirement 2, "a single shared param source, not
 * duplicated math").
 */
describe('offline render / live chain agreement', () => {
  const AMOUNTS: EffectAmounts = { crush: 0, space: 0, echo: 60, tone: 0 };
  const SYNC = { subdivision: 'dottedEighth' as const, bpm: 96 };

  function audioBuffer(): AudioBuffer {
    return { duration: 1, sampleRate: 44100 } as AudioBuffer;
  }

  it('renders the same delay time the live chain plays', async () => {
    const chain = new EffectsChain(
      asToneNode(makeMockNode()),
      asToneNode(makeMockNode()),
    );
    chain.setEchoSync(SYNC);
    chain.setAmount('echo', AMOUNTS.echo);
    const liveDelay = delayInstance().delayTime.value;

    vi.mocked(Tone.FeedbackDelay).mockClear();
    await renderTrackOffline(audioBuffer(), AMOUNTS, SYNC);

    expect(Tone.FeedbackDelay).toHaveBeenCalledWith(
      expect.objectContaining({ delayTime: liveDelay }),
    );
    expect(liveDelay).toBeCloseTo(0.75 * (60 / 96), 10);
  });

  it('renders the fixed default when the track has no sync', async () => {
    await renderTrackOffline(audioBuffer(), AMOUNTS);

    expect(Tone.FeedbackDelay).toHaveBeenCalledWith(
      expect.objectContaining({ delayTime: ECHO_DELAY_SECONDS }),
    );
  });

  it('renders the preview window through the same delay time', async () => {
    await renderTrackOfflineWindow(
      audioBuffer(),
      AMOUNTS,
      {
        renderStartSeconds: 0,
        renderDurationSeconds: 1,
        prerollSeconds: 0,
      },
      SYNC,
    );

    expect(Tone.FeedbackDelay).toHaveBeenCalledWith(
      expect.objectContaining({
        delayTime: selectEchoDelaySeconds(SYNC),
      }),
    );
  });
});

describe('hashEffectAmounts with echo sync', () => {
  const ECHOING: EffectAmounts = { crush: 0, space: 0, echo: 40, tone: 0 };

  it('differs when the subdivision differs', () => {
    const quarter = hashEffectAmounts(ECHOING, {
      subdivision: 'quarter',
      bpm: 120,
    });
    const eighth = hashEffectAmounts(ECHOING, {
      subdivision: 'eighth',
      bpm: 120,
    });

    expect(quarter).not.toBe(eighth);
    expect(quarter).not.toBe(hashEffectAmounts(ECHOING));
  });

  // The delay time follows the current estimate, so a re-estimate has to
  // read as stale — the persisted tiles were rendered at the old delay.
  it('differs when the same subdivision resolves against a new tempo estimate', () => {
    expect(
      hashEffectAmounts(ECHOING, { subdivision: 'quarter', bpm: 120 }),
    ).not.toBe(hashEffectAmounts(ECHOING, { subdivision: 'quarter', bpm: 90 }));
  });

  // A bypassed echo isn't in the chain at all (amount 0 disconnects the
  // node, spec 004 Decision 3), so its delay time changes nothing about the
  // rendered audio. Hashing it anyway would re-render and re-analyse every
  // track the moment its tempo estimate lands, for no visual difference.
  it('ignores the sync while the echo is bypassed', () => {
    expect(
      hashEffectAmounts(DEFAULT_EFFECT_AMOUNTS, {
        subdivision: 'quarter',
        bpm: 120,
      }),
    ).toBe(hashEffectAmounts(DEFAULT_EFFECT_AMOUNTS));
  });
});
