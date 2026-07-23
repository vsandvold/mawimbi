// EffectsChain — per-track insert effects between Tone.Player and Tone.Channel.
//
// Three one-knob macros in fixed order: Space (reverb) → Echo (feedback
// delay) → Tone (lowpass filter), each a 0–100 amount. Amount 0 means the
// node is fully disconnected — bypass, not wet=0 — so idle tracks pay no
// DSP cost (#167, spec 004 Decision 3). Nodes are created lazily on first
// activation and kept (disconnected) across bypass so re-activation is
// instant.

import * as Tone from 'tone';

export const EFFECT_ORDER = ['space', 'echo', 'tone'] as const;
export type EffectId = (typeof EFFECT_ORDER)[number];
export type EffectAmounts = Record<EffectId, number>;

export const MIN_EFFECT_AMOUNT = 0;
export const MAX_EFFECT_AMOUNT = 100;

export const DEFAULT_EFFECT_AMOUNTS: EffectAmounts = {
  space: MIN_EFFECT_AMOUNT,
  echo: MIN_EFFECT_AMOUNT,
  tone: MIN_EFFECT_AMOUNT,
};

// Stable string key for a set of amounts, not a cryptographic hash — spec
// 004 M6 stores this alongside a track's persisted spectrogram to detect
// whether a re-render is needed against the *current* effect settings.
export function hashEffectAmounts(amounts: EffectAmounts): string {
  return EFFECT_ORDER.map((effectId) => amounts[effectId]).join(':');
}

// Macro curves (spec 004 open question 2). Amount maps to wet/feedback/
// cutoff only; the character parameters (decay, delay time) are fixed:
// Tone.Reverb regenerates its impulse response asynchronously on every
// decay change (silent until ready, #489) and delay-time ramps pitch-warp
// the echoes — neither survives a live slider drag. Values are first-pass
// defaults; ear-tuning on device is flagged for the spec's human-QA pass.
// Exported so renderTrackOffline (spec 004 M6, #494) can rebuild the same
// character parameters when re-rendering a track post-effect offline.
export const SPACE_DECAY_SECONDS = 4;
const SPACE_MAX_WET = 0.8;
export const ECHO_DELAY_SECONDS = 0.25;
const ECHO_MAX_WET = 0.5;
const ECHO_MIN_FEEDBACK = 0.1;
const ECHO_MAX_FEEDBACK = 0.6;
const TONE_MAX_CUTOFF_HZ = 12000;
const TONE_MIN_CUTOFF_HZ = 200;

// Short ramp to avoid zipper noise on live slider changes.
const PARAM_RAMP_SECONDS = 0.05;

type EffectNodes = {
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
  private amounts: EffectAmounts = { space: 0, echo: 0, tone: 0 };
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
    // moment. renderTrackOffline's Tone.Offline() calls (effects refresh +
    // live preview, both can be in flight while dragging during playback)
    // synchronously swap that global context for the full duration of their
    // callback, including a real `await reverb.ready` gap — see
    // node_modules/tone/Tone/core/context/Offline.ts. A live-chain node
    // constructed during that window binds to the throwaway
    // OfflineContext; rewire()'s subsequent source.chain(...) then throws
    // (native "cannot connect to an AudioNode belonging to a different
    // audio context"), and since source.disconnect() already ran, the
    // track is left silently disconnected from the destination bus for the
    // rest of the session — confirmed via a real-Tone.js repro, not
    // speculative (session notes, not yet in kb/).
    const context = this.source.context;
    switch (effectId) {
      case 'space':
        this.nodes.space = new Tone.Reverb({
          decay: SPACE_DECAY_SECONDS,
          wet: 0,
          context,
        });
        break;
      case 'echo':
        this.nodes.echo = new Tone.FeedbackDelay({
          delayTime: ECHO_DELAY_SECONDS,
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
