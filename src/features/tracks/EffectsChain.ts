// EffectsChain — per-track insert effects between Tone.Player and Tone.Channel.
//
// Four one-knob macros in fixed order: Crush (bit-depth reduction) → Space
// (reverb) → Echo (feedback delay) → Tone (lowpass filter), each a 0–100
// amount. Amount 0 means the node is fully disconnected — bypass, not
// wet=0 — so idle tracks pay no DSP cost (#167, spec 004 Decision 3). Nodes
// are created lazily on first activation and kept (disconnected) across
// bypass so re-activation is instant.

import * as Tone from 'tone';
import {
  ECHO_MAX_DELAY_SECONDS,
  selectEchoDelaySeconds,
  type EchoSync,
} from './echoSync';

// Crush first: distortion before space is the conventional and
// better-sounding order (spec 007 Decision 5).
export const EFFECT_ORDER = ['crush', 'space', 'echo', 'tone'] as const;
export type EffectId = (typeof EFFECT_ORDER)[number];
export type EffectAmounts = Record<EffectId, number>;

export const MIN_EFFECT_AMOUNT = 0;
export const MAX_EFFECT_AMOUNT = 100;

export const DEFAULT_EFFECT_AMOUNTS: EffectAmounts = {
  crush: MIN_EFFECT_AMOUNT,
  space: MIN_EFFECT_AMOUNT,
  echo: MIN_EFFECT_AMOUNT,
  tone: MIN_EFFECT_AMOUNT,
};

// Field separator of `hashEffectAmounts`' output — also what
// `normalizeEffectsHash` splits a stored hash on.
const HASH_SEPARATOR = ':';

// Every macro set `hashEffectAmounts` has joined before the delay field
// existed, oldest first:
//
// - 3 fields: before Crush shipped (spec 007 M2, #558)
// - 4 fields: before the echo's delay time joined the hash (M4, #560)
//
// Every spectrogram persisted by one of those builds carries a hash of
// exactly that shape — macro amounts only, no trailing delay.
//
// **Adding a macro means adding an entry here _and_ nothing else** — the
// lookup below asks "does this hash carry a delay field?" first, and only
// then matches the remaining fields by count. Keying purely on total field
// count would have been enough today but breaks on the very next widening:
// a fifth macro makes the legacy 5-macro form the same length as this
// build's 4-macros-plus-delay, and the delay would be parsed as a macro
// amount and dropped (`/code-review` on PR #582).
const LEGACY_EFFECT_ORDERS: EffectId[][] = [
  ['space', 'echo', 'tone'],
  ['crush', 'space', 'echo', 'tone'],
];

// Decimal places the echo's delay time contributes to the hash. Three is
// millisecond resolution — finer than any visible difference in a tile, and
// enough that two subdivisions can never round together.
const ECHO_DELAY_HASH_DIGITS = 3;

// What a delay field looks like: `toFixed(ECHO_DELAY_HASH_DIGITS)` output.
// A macro amount is plain `String(number)`, which never produces trailing
// zeros after the point, so the two shapes can't be confused.
const ECHO_DELAY_FIELD = new RegExp(`^\\d+\\.\\d{${ECHO_DELAY_HASH_DIGITS}}$`);

// Fills in macros a persisted object predates. A project written by an
// older build stores an `effects` object with only that build's macros —
// the type says `EffectAmounts`, but the row on disk is whatever was
// written. Reading a missing macro as `undefined` would hash to a value
// nothing can match (re-analysing every track on load) and push `undefined`
// into a track's effect signals.
export function withDefaultEffectAmounts(
  amounts: Partial<EffectAmounts> | undefined,
): EffectAmounts {
  return { ...DEFAULT_EFFECT_AMOUNTS, ...amounts };
}

// Stable string key for a set of amounts, not a cryptographic hash — spec
// 004 M6 stores this alongside a track's persisted spectrogram to detect
// whether a re-render is needed against the *current* effect settings.
//
// `echoSync` contributes the resolved delay time rather than the
// subdivision name, because the delay is what the render actually used: the
// same subdivision against a re-estimated tempo is a different sound, and
// the persisted tiles have to read as stale for it (spec 007 M4, #560).
export function hashEffectAmounts(
  amounts: EffectAmounts,
  echoSync: EchoSync | null = null,
): string {
  const complete = withDefaultEffectAmounts(amounts);
  const fields: Array<number | string> = EFFECT_ORDER.map(
    (effectId) => complete[effectId],
  );
  fields.push(hashEchoDelayField(complete, echoSync));
  return fields.join(HASH_SEPARATOR);
}

// A bypassed echo is disconnected from the chain entirely (amount 0 means
// bypass, not wet=0), so its delay time cannot change what the render
// sounds like. Hashing it regardless would mark every track stale the
// moment its tempo estimate lands, re-rendering and re-analysing for no
// visible difference.
function hashEchoDelayField(
  amounts: EffectAmounts,
  echoSync: EchoSync | null,
): string {
  const audible = amounts.echo > MIN_EFFECT_AMOUNT ? echoSync : null;
  return selectEchoDelaySeconds(audible).toFixed(ECHO_DELAY_HASH_DIGITS);
}

// Migrates a stored hash to the current field set so an existing project's
// spectrograms aren't all judged stale the first time it loads under a
// build with more macros (spec 007 Goal 6). This is the single migration
// point on purpose: normalize before comparing, rather than rewriting
// persisted rows — the stored hash is only ever read to answer "is this
// still current?", so there is nothing else to keep in sync.
//
// An unrecognized shape is returned unchanged, which reads as "stale" at
// the comparison and re-analyses — the safe direction: a wrong guess at
// what an unknown format meant would show the wrong pixels indefinitely.
export function normalizeEffectsHash(hash: string): string {
  const fields = hash.split(HASH_SEPARATOR);
  // A hash with a delay field is this format or a later one — either way
  // there is nothing here that can safely rewrite it, so leave it alone.
  if (ECHO_DELAY_FIELD.test(fields[fields.length - 1] ?? '')) return hash;

  const legacyOrder = LEGACY_EFFECT_ORDERS.find(
    (order) => order.length === fields.length,
  );
  if (!legacyOrder) return hash;

  const amounts = { ...DEFAULT_EFFECT_AMOUNTS };
  for (const [index, effectId] of legacyOrder.entries()) {
    const amount = Number(fields[index]);
    if (!Number.isFinite(amount)) return hash;
    amounts[effectId] = amount;
  }
  // No sync: every build that wrote a legacy hash played the fixed delay.
  return hashEffectAmounts(amounts, null);
}

// Macro curves (spec 004 open question 2). Amount maps to wet/feedback/
// cutoff only; the character parameters (decay, delay time) are fixed:
// Tone.Reverb regenerates its impulse response asynchronously on every
// decay change (silent until ready, #489) and delay-time ramps pitch-warp
// the echoes — neither survives a live slider drag. Values are first-pass
// defaults; ear-tuning on device is flagged for the spec's human-QA pass.
// Exported so renderTrackOffline (spec 004 M6, #494) can rebuild the same
// character parameters when re-rendering a track post-effect offline.

// Crush's character parameter is its bit depth, which the macro *does*
// drive (unlike reverb decay or delay time): it is the timbre this macro
// exists to change, and Tone.BitCrusher's `bits` is a plain Param that
// ramps without artefacts. 16 bits is transparent (the node's own maximum,
// audibly a no-op) and ~3 is the coarse, obviously-digital end — below
// that the signal is mostly quantization noise rather than a crushed
// version of the source.
const CRUSH_MAX_BITS = 16;
const CRUSH_MIN_BITS = 3;
// Deliberately below 1, unlike a "fully wet at maximum" macro would be:
// Tone.BitCrusher's worklet is connected inside `ToneAudioWorklet`'s async
// `addAudioWorkletModule(...).then(...)` (its `onReady`), so between
// constructing the node and that promise resolving the *wet* path passes no
// signal at all. At wet 1.0 the crossfade has also attenuated the dry path
// to nothing, so the track goes briefly, audibly silent the first time
// Crush is activated in a session — the same "silent until ready" hazard as
// Tone.Reverb's asynchronous impulse response (#489), reached by a
// different mechanism. Keeping a dry floor means the worst case is a short
// dip, not a dropout (Space's 0.8 has the same effect for the same class of
// reason). /code-review on PR #578.
const CRUSH_MAX_WET = 0.8;
export const SPACE_DECAY_SECONDS = 4;
const SPACE_MAX_WET = 0.8;
const ECHO_MAX_WET = 0.5;
const ECHO_MIN_FEEDBACK = 0.1;
const ECHO_MAX_FEEDBACK = 0.6;
const TONE_MAX_CUTOFF_HZ = 12000;
const TONE_MIN_CUTOFF_HZ = 200;

// Short ramp to avoid zipper noise on live slider changes.
const PARAM_RAMP_SECONDS = 0.05;

type EffectNodes = {
  crush?: Tone.BitCrusher;
  space?: Tone.Reverb;
  echo?: Tone.FeedbackDelay;
  tone?: Tone.Filter;
};

// Common surface of Tone.Signal/Tone.Param the macros drive.
type RampableParam = {
  value: number;
  rampTo: (value: number, rampTime: number) => unknown;
};

class EffectsChain {
  private source: Tone.ToneAudioNode;
  private destination: Tone.ToneAudioNode;
  private amounts: EffectAmounts = { ...DEFAULT_EFFECT_AMOUNTS };
  private echoSync: EchoSync | null = null;
  private nodes: EffectNodes = {};

  constructor(source: Tone.ToneAudioNode, destination: Tone.ToneAudioNode) {
    this.source = source;
    this.destination = destination;
    this.rewire();
  }

  setAmount(effectId: EffectId, amount: number): void {
    const clamped = clampAmount(amount);
    const wasActive = this.isActive(effectId);
    this.amounts[effectId] = clamped;

    if (clamped > MIN_EFFECT_AMOUNT) {
      this.ensureNode(effectId);
      // A node reconnecting from bypass still holds its pre-bypass params;
      // ramping from those would replay the old intensity for the ramp
      // duration. Snap on (re)activation — the node was silent, so there
      // is no zipper risk — and ramp only on live changes.
      if (wasActive) {
        this.rampAmount(effectId, clamped);
      } else {
        this.snapAmount(effectId, clamped);
      }
    }
    if (wasActive !== this.isActive(effectId)) {
      this.rewire();
    }
  }

  getAmount(effectId: EffectId): number {
    return this.amounts[effectId];
  }

  // Tempo-synced Echo (spec 007 Goal 5, #560). The delay time is **snapped**,
  // never ramped: ramping it sweeps the delay line and pitch-warps the
  // echoes on the way, which is why spec 004 fixed it as a constant (#492).
  // A subdivision commit is a discrete, explicit user action rather than a
  // continuous drag, so the momentary discontinuity is licensed — the same
  // license as the snap on reactivation above (spec 007 Decision 5: character
  // params are fixed *during* interaction; discrete commits may snap them).
  //
  // No node is created here: a track can carry a sync while its Echo sits at
  // 0, and `ensureNode` picks the current sync up when the macro is first
  // turned on.
  setEchoSync(echoSync: EchoSync | null): void {
    const previous = selectEchoDelaySeconds(this.echoSync);
    this.echoSync = echoSync;
    const delaySeconds = selectEchoDelaySeconds(echoSync);
    if (delaySeconds === previous) return;
    if (this.nodes.echo) {
      this.nodes.echo.delayTime.value = delaySeconds;
    }
  }

  getEchoSync(): EchoSync | null {
    return this.echoSync;
  }

  dispose(): void {
    for (const node of this.createdNodes()) {
      node.dispose();
    }
    this.nodes = {};
  }

  private isActive(effectId: EffectId): boolean {
    return this.amounts[effectId] > MIN_EFFECT_AMOUNT;
  }

  private rewire(): void {
    this.source.disconnect();
    for (const node of this.createdNodes()) {
      node.disconnect();
    }
    const activeNodes = EFFECT_ORDER.filter((effectId) =>
      this.isActive(effectId),
    ).map((effectId) => this.nodes[effectId]!);
    this.source.chain(...activeNodes, this.destination);
  }

  private ensureNode(effectId: EffectId): void {
    if (this.nodes[effectId]) return;
    // The reverb's impulse response generates asynchronously (silent until
    // its `ready` resolves, #489). Wiring immediately is fine live: the
    // dry portion of the crossfade keeps sounding while the IR renders.
    //
    // `context: this.source.context` is required, not cosmetic: without it
    // a bare `new Tone.Reverb(...)` binds to whatever Tone.getContext()
    // (the process-global current context) happens to be at this exact
    // moment, rather than to the live track's own context. renderTrackOffline
    // used to swap that global out from under live code this way (fixed in
    // #554 — it now builds its own Tone.OfflineContext and never touches the
    // global at all), and any future code that does the same thing — a
    // library call, a worker bridge, anything reaching for Tone.setContext()
    // — would silently re-break this the same way: a live-chain node bound
    // to the wrong context makes rewire()'s subsequent source.chain(...)
    // throw (native "cannot connect to an AudioNode belonging to a
    // different audio context"), and since source.disconnect() already ran,
    // the track is left silently disconnected from the destination bus for
    // the rest of the session — confirmed via a real-Tone.js repro, not
    // speculative (session notes, not yet in kb/).
    const context = this.source.context;
    switch (effectId) {
      case 'crush':
        // Worklet-backed, and confirmed to render correctly on the manual
        // Tone.OfflineContext renderTrackOffline builds (spec 007 M1,
        // kb/decisions.md 2026-07-24) — so the same node serves the live
        // chain and the offline renders, with no second implementation.
        // `wet` is set on the param rather than passed in: Tone types
        // BitCrusher's constructor options from its *worklet* options, which
        // omit the `wet` every Effect subclass actually has. Silent until
        // `snapAmount` runs (still before `rewire` wires it up).
        this.nodes.crush = new Tone.BitCrusher({
          bits: CRUSH_MAX_BITS,
          context,
        });
        this.nodes.crush.wet.value = 0;
        break;
      case 'space':
        this.nodes.space = new Tone.Reverb({
          decay: SPACE_DECAY_SECONDS,
          wet: 0,
          context,
        });
        break;
      case 'echo':
        // `maxDelay` is required, not cosmetic: it fixes the size of the
        // underlying native delay line at construction and cannot be raised
        // afterwards, and Tone's own default is 1s — a quarter note below
        // 60 BPM exceeds that, and the native DelayNode *clamps* rather than
        // erroring, so a slow track's synced echo would silently play at the
        // wrong time (spec 007 M4, #560).
        this.nodes.echo = new Tone.FeedbackDelay({
          delayTime: selectEchoDelaySeconds(this.echoSync),
          maxDelay: ECHO_MAX_DELAY_SECONDS,
          feedback: ECHO_MIN_FEEDBACK,
          wet: 0,
          context,
        });
        break;
      case 'tone':
        this.nodes.tone = new Tone.Filter({
          frequency: TONE_MAX_CUTOFF_HZ,
          type: 'lowpass',
          context,
        });
        break;
    }
  }

  private rampAmount(effectId: EffectId, amount: number): void {
    for (const [param, target] of this.paramTargets(effectId, amount)) {
      param.rampTo(target, PARAM_RAMP_SECONDS);
    }
  }

  private snapAmount(effectId: EffectId, amount: number): void {
    for (const [param, target] of this.paramTargets(effectId, amount)) {
      param.value = target;
    }
  }

  private paramTargets(
    effectId: EffectId,
    amount: number,
  ): Array<[RampableParam, number]> {
    switch (effectId) {
      case 'crush': {
        const { bits, wet } = mapCrushAmount(amount);
        return [
          [this.nodes.crush!.bits, bits],
          [this.nodes.crush!.wet, wet],
        ];
      }
      case 'space': {
        return [[this.nodes.space!.wet, mapSpaceAmount(amount).wet]];
      }
      case 'echo': {
        const { wet, feedback } = mapEchoAmount(amount);
        return [
          [this.nodes.echo!.wet, wet],
          [this.nodes.echo!.feedback, feedback],
        ];
      }
      case 'tone': {
        // Filter's frequency Signal is typed in Frequency units (string |
        // number); the macro only ever writes plain Hz numbers.
        const frequency = this.nodes.tone!
          .frequency as unknown as RampableParam;
        return [[frequency, mapToneAmount(amount).cutoffHz]];
      }
    }
  }

  private createdNodes(): Tone.ToneAudioNode[] {
    return EFFECT_ORDER.flatMap((effectId) => this.nodes[effectId] ?? []);
  }
}

export function mapCrushAmount(amount: number): {
  bits: number;
  wet: number;
} {
  // Exponential, so equal slider steps feel like equal steps of coarseness:
  // the audible difference between 16 and 12 bits is far smaller than
  // between 6 and 4, and a linear sweep would spend most of its travel in
  // the inaudible upper range.
  const bitRatio = CRUSH_MIN_BITS / CRUSH_MAX_BITS;
  const t = normalize(amount);
  return {
    bits: CRUSH_MAX_BITS * Math.pow(bitRatio, t),
    wet: t * CRUSH_MAX_WET,
  };
}

export function mapSpaceAmount(amount: number): { wet: number } {
  return { wet: normalize(amount) * SPACE_MAX_WET };
}

export function mapEchoAmount(amount: number): {
  wet: number;
  feedback: number;
} {
  const t = normalize(amount);
  return {
    wet: t * ECHO_MAX_WET,
    feedback: ECHO_MIN_FEEDBACK + t * (ECHO_MAX_FEEDBACK - ECHO_MIN_FEEDBACK),
  };
}

export function mapToneAmount(amount: number): { cutoffHz: number } {
  // Exponential sweep so equal slider steps feel like equal pitch steps;
  // more amount = lower cutoff = darker.
  const octaveRatio = TONE_MIN_CUTOFF_HZ / TONE_MAX_CUTOFF_HZ;
  return {
    cutoffHz: TONE_MAX_CUTOFF_HZ * Math.pow(octaveRatio, normalize(amount)),
  };
}

function clampAmount(amount: number): number {
  return Math.min(MAX_EFFECT_AMOUNT, Math.max(MIN_EFFECT_AMOUNT, amount));
}

function normalize(amount: number): number {
  return clampAmount(amount) / MAX_EFFECT_AMOUNT;
}

export default EffectsChain;
