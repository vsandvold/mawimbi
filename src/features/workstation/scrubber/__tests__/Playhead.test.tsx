import { render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BeatPulse } from '../../../rhythm/BeatPulse';
import Playhead, { type PlayheadHandle } from '../Playhead';

/**
 * A layout change is not a playback discontinuity (`/code-review` on PR
 * #588). `Playhead` redraws the resting meter on a resize and on a
 * re-solved runway width, and both fire *during* playback — a window drag,
 * a bottom sheet opening. Routing those through the resetting entry point
 * dropped the arrival envelope's phase, so the next frame had no interval
 * to have crossed a beat in and the flare simply didn't happen.
 *
 * Spying on `BeatPulse.reset` rather than on canvas output: `getContext` is
 * a null-returning stub in jsdom (setupTests.ts) and the meter's drawing is
 * deliberately untested anyway (#365). What's under test is which of the
 * two entry points each call site reaches, which is exactly this call.
 */

/** Captures observers so the resize callback can be driven — the global
    stub in setupTests.ts is a no-op that never fires. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  constructor(private callback: ResizeObserverCallback) {
    RecordingResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire(width: number, height: number) {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

const originalResizeObserver = globalThis.ResizeObserver;
let resetSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver =
    RecordingResizeObserver as unknown as typeof globalThis.ResizeObserver;
  // A context, so the meter's own early return on `!ctx` doesn't make every
  // assertion below vacuously true.
  // `getContext`'s overloads resolve to the WebGPU one for an untyped
  // object literal, so the stub is cast through the property rather than
  // the argument.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    save: () => {},
    restore: () => {},
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  resetSpy = vi.spyOn(BeatPulse.prototype, 'reset');
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
});

describe('Playhead idle redraws', () => {
  it('does not reset the arrival envelope when the canvas is resized', () => {
    render(<Playhead visibleHeight={600} meterWidthFraction={0.65} />);
    resetSpy.mockClear();

    const [observer] = RecordingResizeObserver.instances;
    expect(observer, 'the playhead never observed its container').toBeDefined();
    observer.fire(1280, 160);

    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('does not reset the arrival envelope when the runway width is re-solved', () => {
    const { rerender } = render(
      <Playhead visibleHeight={600} meterWidthFraction={0.65} />,
    );
    resetSpy.mockClear();

    // Opening a bottom sheet re-solves the geometry mid-playback.
    rerender(<Playhead visibleHeight={400} meterWidthFraction={0.5} />);

    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('does reset the arrival envelope on a playback discontinuity', () => {
    // The positive control: without it, the two negatives above would pass
    // just as well if `renderIdle` had stopped reaching the meter at all
    // (kb/verification.md — pair every "didn't happen" with a "did").
    const ref = createRef<PlayheadHandle>();
    render(
      <Playhead ref={ref} visibleHeight={600} meterWidthFraction={0.65} />,
    );
    resetSpy.mockClear();

    ref.current!.renderIdle();

    expect(resetSpy).toHaveBeenCalled();
  });
});
