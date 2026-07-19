import { effect } from '@preact/signals-react';
import { activeRunwayConfig, beatSaber } from '../runwayConfig';
import {
  closeTuningOverlay,
  getConfigOverride,
  resetTuningSignals,
  selectTuningPreset,
  setTuningValue,
  signals,
  toggleTuningOverlay,
} from '../tuningSignals';

afterEach(() => {
  resetTuningSignals();
});

describe('toggleTuningOverlay', () => {
  it('opens the overlay and seeds the override from the given preset', () => {
    toggleTuningOverlay(activeRunwayConfig);

    expect(getConfigOverride()).toEqual(activeRunwayConfig);
    // A copy, not the same reference — mutating the override must not
    // mutate the preset it was seeded from.
    expect(getConfigOverride()).not.toBe(activeRunwayConfig);
  });

  it('closes the overlay and clears the override on a second call', () => {
    toggleTuningOverlay(activeRunwayConfig);

    toggleTuningOverlay(activeRunwayConfig);

    expect(getConfigOverride()).toBeNull();
  });
});

describe('setTuningValue', () => {
  it('composes the override over the active preset, leaving other fields untouched', () => {
    toggleTuningOverlay(activeRunwayConfig);

    setTuningValue('tiltDeg', 45);

    const override = getConfigOverride();
    expect(override?.tiltDeg).toBe(45);
    expect(override?.playheadFraction).toBe(
      activeRunwayConfig.playheadFraction,
    );
  });

  it('is a no-op when the overlay has never been opened', () => {
    setTuningValue('tiltDeg', 45);

    expect(getConfigOverride()).toBeNull();
  });
});

describe('selectTuningPreset', () => {
  it('replaces the override with a fresh copy of the selected preset', () => {
    toggleTuningOverlay(activeRunwayConfig);
    setTuningValue('tiltDeg', 12);

    selectTuningPreset(beatSaber);

    expect(getConfigOverride()).toEqual(beatSaber);
  });
});

describe('closeTuningOverlay', () => {
  it('reverts cleanly: override composes back to null, restoring activeRunwayConfig as the effective config', () => {
    toggleTuningOverlay(activeRunwayConfig);
    setTuningValue('tiltDeg', 12);

    closeTuningOverlay();

    expect(getConfigOverride()).toBeNull();
    // The "compose over the active preset" contract useScrubberGeometry
    // relies on: `override ?? activeRunwayConfig`.
    expect(getConfigOverride() ?? activeRunwayConfig).toBe(activeRunwayConfig);
  });
});

describe('signals.isOpen', () => {
  it('reflects whether the override is open', () => {
    expect(signals.isOpen.value).toBe(false);

    toggleTuningOverlay(activeRunwayConfig);

    expect(signals.isOpen.value).toBe(true);
  });

  it('does not notify subscribers on a tuning value change while already open', () => {
    toggleTuningOverlay(activeRunwayConfig);
    const notifications: boolean[] = [];
    const dispose = effect(() => {
      notifications.push(signals.isOpen.value);
    });
    notifications.length = 0; // drop the initial run triggered by subscribing

    setTuningValue('tiltDeg', 45);
    setTuningValue('tiltDeg', 50);

    expect(notifications).toEqual([]);
    dispose();
  });
});
