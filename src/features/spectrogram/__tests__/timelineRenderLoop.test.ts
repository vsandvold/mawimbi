import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineRenderLoop, {
  type TimelineRenderCallback,
} from '../TimelineRenderLoop';

/**
 * `requestAnimationFrame` is stubbed so `register()`'s background loop
 * never actually fires during these tests — every assertion drives frames
 * explicitly via `loop.runFrame()` instead, per TimelineRenderLoop.ts's own
 * doc comment on why `runFrame` isn't private.
 */
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function makeCallback(
  overrides: Partial<TimelineRenderCallback> = {},
): TimelineRenderCallback & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    bypassIdle: false,
    peekDirty: () => false,
    measure: () => calls.push('measure'),
    write: () => calls.push('write'),
    ...overrides,
  };
}

describe('TimelineRenderLoop registry lifecycle', () => {
  it('runs a registered callback on an active frame', () => {
    const loop = new TimelineRenderLoop();
    const callback = makeCallback({ peekDirty: () => true });

    loop.register(callback);
    loop.runFrame();

    expect(callback.calls).toEqual(['measure', 'write']);
  });

  it('stops invoking a callback once unregistered', () => {
    const loop = new TimelineRenderLoop();
    const callback = makeCallback({ peekDirty: () => true });

    const unregister = loop.register(callback);
    loop.runFrame();
    expect(callback.calls).toEqual(['measure', 'write']);

    unregister();
    callback.calls.length = 0;
    loop.runFrame();

    expect(callback.calls).toEqual([]);
  });

  it('does nothing on a frame with no registered callbacks', () => {
    const loop = new TimelineRenderLoop();
    expect(() => loop.runFrame()).not.toThrow();
  });
});

describe('TimelineRenderLoop measure/write phase ordering', () => {
  it('runs every callback’s measure phase before any callback’s write phase', () => {
    const loop = new TimelineRenderLoop();
    const order: string[] = [];
    const a = makeCallback({
      peekDirty: () => true,
      measure: () => order.push('measure:a'),
      write: () => order.push('write:a'),
    });
    const b = makeCallback({
      peekDirty: () => true,
      measure: () => order.push('measure:b'),
      write: () => order.push('write:b'),
    });

    loop.register(a);
    loop.register(b);
    loop.runFrame();

    const lastMeasureIndex = Math.max(
      order.indexOf('measure:a'),
      order.indexOf('measure:b'),
    );
    const firstWriteIndex = Math.min(
      order.indexOf('write:a'),
      order.indexOf('write:b'),
    );
    expect(lastMeasureIndex).toBeLessThan(firstWriteIndex);
  });

  it('passes the same shared canvas window to every callback in the frame', () => {
    const loop = new TimelineRenderLoop();
    const seenWindows: unknown[] = [];
    const a = makeCallback({
      peekDirty: () => true,
      write: (win) => seenWindows.push(win),
    });
    const b = makeCallback({
      peekDirty: () => true,
      write: (win) => seenWindows.push(win),
    });

    loop.register(a);
    loop.register(b);
    loop.runFrame();

    expect(seenWindows).toHaveLength(2);
    expect(seenWindows[0]).toBe(seenWindows[1]);
  });
});

describe('TimelineRenderLoop idle short-circuit', () => {
  it('skips measure/write entirely once nothing has changed', () => {
    const loop = new TimelineRenderLoop();
    const callback = makeCallback({ peekDirty: () => false });
    loop.register(callback);

    // First frame always transitions from the loop's unset initial scroll
    // baseline, so it counts as "changed" — settle that before asserting.
    loop.runFrame();
    callback.calls.length = 0;

    loop.runFrame();
    loop.runFrame();
    loop.runFrame();

    expect(callback.calls).toEqual([]);
  });

  it('resumes measure/write once a callback reports itself dirty', () => {
    const loop = new TimelineRenderLoop();
    let dirty = false;
    const callback = makeCallback({ peekDirty: () => dirty });
    loop.register(callback);
    loop.runFrame();
    callback.calls.length = 0;

    loop.runFrame();
    expect(callback.calls).toEqual([]);

    dirty = true;
    loop.runFrame();
    expect(callback.calls).toEqual(['measure', 'write']);
  });

  it('runs a bypass-idle (recording) callback’s measure/write even on an otherwise-idle frame', () => {
    const loop = new TimelineRenderLoop();
    const idleCallback = makeCallback({ peekDirty: () => false });
    const recordingCallback = makeCallback({ bypassIdle: true });
    loop.register(idleCallback);
    loop.register(recordingCallback);

    // Settle the initial-frame transition for both.
    loop.runFrame();
    idleCallback.calls.length = 0;
    recordingCallback.calls.length = 0;

    loop.runFrame();
    loop.runFrame();

    expect(idleCallback.calls).toEqual([]);
    expect(recordingCallback.calls).toEqual([
      'measure',
      'write',
      'measure',
      'write',
    ]);
  });
});
