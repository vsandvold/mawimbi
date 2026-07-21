import { type EffectAmounts } from './EffectsChain';

export type TrackId = string;

export type TrackColor = {
  r: number;
  g: number;
  b: number;
};

export type Track = {
  trackId: TrackId;
  color: TrackColor;
  fileName: string;
  index: number;
  instrument?: string;
  startTime?: number;
  effects?: EffectAmounts;
};
