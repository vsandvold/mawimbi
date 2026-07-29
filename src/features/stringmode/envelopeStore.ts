// SPIKE (mawimbi#593) — in-memory envelope cache.
//
// **No IndexedDB store and no `DB_VERSION` bump** (hard constraint 1 on
// #593). Spec 009 Decision 3 persists these in an `envelopes` store at
// `DB_VERSION` 5; a spike must not, because a spike gets reverted and
// `openDB(name, 4)` against a database already upgraded to 5 throws
// `VersionError` permanently for any origin that saw the spike build —
// and `kb/decisions.md` (2026-07-25) already flags the missing
// `blocking()` handler as making version bumps hazardous.
//
// The cost of that constraint is re-derivation on every load, which is why
// extraction only runs while String mode is actually active.

import { signal } from '@preact/signals-react';
import { type TrackEnvelopes } from './envelopes';

const entries = new Map<string, TrackEnvelopes>();
const inFlight = new Set<string>();

// Bumped on every write. The only reactive surface these have — a plain
// Map cannot notify, and `SpectrogramCache` (which owns no signal either)
// is the worked example of why a render-time poll is not a substitute
// (`useTempoSync` subscribes for exactly this reason, #559).
const _version = signal(0);

export const signals = { version: _version };

export function getEnvelopes(trackId: string): TrackEnvelopes | undefined {
  return entries.get(trackId);
}

export function getEnvelopeVersion(): number {
  return _version.value;
}

export function setEnvelopes(trackId: string, envelopes: TrackEnvelopes): void {
  entries.set(trackId, envelopes);
  inFlight.delete(trackId);
  _version.value = _version.value + 1;
}

/**
 * Marks an extraction as started, or reports that one already is.
 * Returns false when this track is already cached or already in flight.
 */
export function claimExtraction(trackId: string): boolean {
  if (entries.has(trackId) || inFlight.has(trackId)) return false;
  inFlight.add(trackId);
  return true;
}

export function releaseExtraction(trackId: string): void {
  inFlight.delete(trackId);
}

export function invalidateEnvelopes(trackId: string): void {
  entries.delete(trackId);
  inFlight.delete(trackId);
  _version.value = _version.value + 1;
}

export function resetEnvelopeStore(): void {
  entries.clear();
  inFlight.clear();
  _version.value = 0;
}
