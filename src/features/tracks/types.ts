import { type TrackTempo } from '../rhythm/tempo';
import { type EffectAmounts } from './EffectsChain';
import { type EchoSubdivision } from './echoSync';

export type TrackId = string;

export type TrackColor = {
  r: number;
  g: number;
  b: number;
};

// Slider default absent any persisted or loudness-normalized value.
export const DEFAULT_VOLUME = 100;

export type Track = {
  trackId: TrackId;
  color: TrackColor;
  fileName: string;
  index: number;
  instrument?: string;
  // Display copy of the track's rhythm analysis scalars (spec 007 Goal 4,
  // #559) — two numbers, so they ride on the track record and persist with
  // the project, unlike the beat ticks and onsets, which are bulk and live
  // in the `rhythms` store. Absent until analysis lands, or if it failed.
  tempo?: TrackTempo;
  startTime?: number;
  effects?: EffectAmounts;
  // Committed Echo subdivision (spec 007 Goal 5, #560). The *subdivision* is
  // what persists, not a delay time: the seconds are derived from whatever
  // tempo estimate the track has when the echo is played or rendered, so a
  // later re-estimate moves the echo with the BPM the drawer shows instead
  // of leaving the two disagreeing. Absent means the fixed default delay.
  echoSync?: EchoSubdivision;
  volume?: number;
  mute?: boolean;
  solo?: boolean;
};
