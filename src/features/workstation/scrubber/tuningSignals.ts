import { signal, type ReadonlySignal } from '@preact/signals-react';
import { type RunwayPreset } from './runwayConfig';

const _configOverride = signal<RunwayPreset | null>(null);

// Narrow channel for reactive consumers (hooks)
export const signals = {
  configOverride: _configOverride as ReadonlySignal<RunwayPreset | null>,
};

// Plain getter for non-reactive consumers (tests, workflows)
export function getConfigOverride(): RunwayPreset | null {
  return _configOverride.value;
}

/**
 * Opens the overlay and seeds the override from `preset`, or closes it and
 * clears the override, reverting the scrubber to `activeRunwayConfig`. The
 * override being non-null IS the overlay's open state — there is no separate
 * open flag to keep in sync with it.
 */
export function toggleTuningOverlay(preset: RunwayPreset): void {
  if (_configOverride.value) {
    closeTuningOverlay();
    return;
  }
  _configOverride.value = { ...preset };
}

export function closeTuningOverlay(): void {
  _configOverride.value = null;
}

/** Resets the override to a fresh copy of `preset`, discarding tuned values. */
export function selectTuningPreset(preset: RunwayPreset): void {
  _configOverride.value = { ...preset };
}

export function setTuningValue(key: keyof RunwayPreset, value: number): void {
  if (!_configOverride.value) return;
  _configOverride.value = { ..._configOverride.value, [key]: value };
}

export function resetTuningSignals(): void {
  _configOverride.value = null;
}
