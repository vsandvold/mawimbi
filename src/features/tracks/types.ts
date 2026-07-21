import { type EffectAmounts } from './EffectsChain';

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
  startTime?: number;
  effects?: EffectAmounts;
  volume?: number;
  mute?: boolean;
  solo?: boolean;
};
