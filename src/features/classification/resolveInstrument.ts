// resolveInstrument — the one rule for "what instrument is this track?"
//
// The track record wins over the classification service: it holds the user's
// own correction (Channel's dropdown dispatches SET_INSTRUMENT) and it is the
// only copy that survives a reload. The service entry is the live channel for
// a classification that is still arriving on a freshly uploaded track, which
// has no persisted label yet.

import { type ClassificationResult } from './InstrumentClassificationService';
import { type Track } from '../tracks/types';

export function resolveInstrument(
  track: Track,
  classification: ClassificationResult | undefined,
): string | undefined {
  return track.instrument ?? classification?.label;
}
