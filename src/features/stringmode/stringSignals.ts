// SPIKE (mawimbi#593) — String mode's view state.
//
// A signal module, not a reducer field: spec 009 Decision 4 notes that
// `workstationReducer.pixelsPerSecond` is vestigial (no action writes it)
// and that zoom actually lives in `workstationSignals.ts`. View state
// follows zoom, not the reducer.
//
// The per-frame render loop reads these through the plain getters below —
// never `.value` on a signal obtained outside a bridge hook (CLAUDE.md).

import { signal, type ReadonlySignal } from '@preact/signals-react';
import {
  DEFAULT_STRING_PARAMS,
  type StringParamKey,
  type StringParams,
} from './stringParams';

const _params = signal<StringParams>({ ...DEFAULT_STRING_PARAMS });
const _isOverlayOpen = signal(false);
const _isHudVisible = signal(true);

// Bumped on every parameter write. The render loop's `peekDirty` compares
// this one integer instead of 27 fields — and, unlike comparing the params
// object by reference, it stays a cheap number even if a future caller
// mutates in place.
const _paramsVersion = signal(0);

export const signals = {
  params: _params as ReadonlySignal<StringParams>,
  isOverlayOpen: _isOverlayOpen as ReadonlySignal<boolean>,
  isHudVisible: _isHudVisible as ReadonlySignal<boolean>,
};

// --- Plain getters (render loop, tests) ---

export function getStringParams(): StringParams {
  return _params.value;
}

export function getStringParamsVersion(): number {
  return _paramsVersion.value;
}

// --- Commands ---

export function setStringParam(key: StringParamKey, value: number): void {
  if (_params.value[key] === value) return;
  _params.value = { ..._params.value, [key]: value };
  _paramsVersion.value = _paramsVersion.value + 1;
}

export function resetStringParams(): void {
  _params.value = { ...DEFAULT_STRING_PARAMS };
  _paramsVersion.value = _paramsVersion.value + 1;
}

export function toggleStringOverlay(): void {
  _isOverlayOpen.value = !_isOverlayOpen.value;
}

export function toggleStringHud(): void {
  _isHudVisible.value = !_isHudVisible.value;
}

/** Test-only reset — mirrors `resetTuningSignals` in the runway's overlay. */
export function resetStringSignals(): void {
  _params.value = { ...DEFAULT_STRING_PARAMS };
  _paramsVersion.value = 0;
  _isOverlayOpen.value = false;
  _isHudVisible.value = true;
}
