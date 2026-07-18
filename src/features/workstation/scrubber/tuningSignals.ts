import { signal, type ReadonlySignal } from '@preact/signals-react';
import { type RunwayPreset } from './runwayConfig';

const _isOverlayOpen = signal(false);
const _configOverride = signal<RunwayPreset | null>(null);

// Narrow channel for reactive consumers (hooks)
export const signals = {
  isOverlayOpen: _isOverlayOpen as ReadonlySignal<boolean>,
  configOverride: _configOverride as ReadonlySignal<RunwayPreset | null>,
};

// Plain getter for non-reactive consumers (tests, workflows)
export function getConfigOverride(): RunwayPreset | null {
  return _configOverride.value;
}

/**
 * Opens the overlay and seeds the override from `preset`, or closes it and
 * clears the override, reverting the scrubber to `activeRunwayConfig`.
 */
export function toggleTuningOverlay(preset: RunwayPreset): void {
  if (_isOverlayOpen.value) {
    closeTuningOverlay();
    return;
  }
  _isOverlayOpen.value = true;
  _configOverride.value = { ...preset };
}

export function closeTuningOverlay(): void {
  _isOverlayOpen.value = false;
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
  _isOverlayOpen.value = false;
  _configOverride.value = null;
}
