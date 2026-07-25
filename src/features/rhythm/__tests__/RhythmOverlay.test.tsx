/**
 * The overlay's contract with `TimelineRenderLoop`: it must report itself
 * clean once it has nothing left to do, or it holds the whole loop out of
 * its idle short-circuit — every mounted track pays for it, not just this
 * canvas (mawimbi#541's entire point).
 *
 * The regression these pin (caught by `e2e/spectrogram-render-loop.spec.ts`
 * on CI, #569): `peekDirty` compares against sentinels that only `write`
 * clears, and `write` deliberately returns early when there is nothing to
 * draw — so a project with no confident anchor reported dirty on every
 * frame forever. Same trap `Spectrogram.tsx`'s zero-melody-note comment
 * documents, reached from the opposite direction.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type TimelineRenderCallback,
  type SharedCanvasWindow,
} from '../../spectrogram/TimelineRenderLoop';
import RhythmOverlay from '../RhythmOverlay';

const { mockRegister, mockUseRhythmAnchor } = vi.hoisted(() => ({
  mockRegister: vi.fn().mockReturnValue(() => {}),
  mockUseRhythmAnchor: vi.fn(),
}));

// Only the loop singleton is replaced; `getContentOffsetTop` stays real so
// the measure phase exercises the same DOM walk production does.
vi.mock('../../spectrogram/TimelineRenderLoop', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../spectrogram/TimelineRenderLoop')
  >()),
  timelineRenderLoop: { register: mockRegister },
}));

vi.mock('../useRhythmAnchor', () => ({
  useRhythmAnchor: () => mockUseRhythmAnchor(),
}));

/**
 * `setupTests.ts`'s global `getContext` stub returns `null`, which makes
 * `write` bail before it can record that it drew anything — so the
 * anchor-disappears case below could never be reached. A minimal 2D
 * context is enough: nothing here asserts on the drawing itself (that is
 * `rhythmOverlayRenderer.test.ts`'s job), only on whether the callback
 * settles.
 */
function stubCanvasContext() {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  };
  // Assigned rather than `vi.spyOn`ed: `getContext` is overloaded, and the
  // spy's return type resolves to the last overload (`GPUCanvasContext`),
  // which a 2D context can't satisfy. Contained to this file — Vitest
  // isolates the jsdom environment per test file.
  HTMLCanvasElement.prototype.getContext = vi
    .fn()
    .mockReturnValue(context) as HTMLCanvasElement['getContext'];
  return context;
}

const WINDOW: SharedCanvasWindow = {
  width: 800,
  height: 600,
  contentTop: 0,
};

function registeredCallback(): TimelineRenderCallback {
  return mockRegister.mock.calls[mockRegister.mock.calls.length - 1][0];
}

function runFrame(callback: TimelineRenderCallback): void {
  callback.measure(WINDOW);
  callback.write(WINDOW);
}

function renderOverlay() {
  render(<RhythmOverlay pixelsPerSecond={200} tracks={[]} />);
  return registeredCallback();
}

describe('RhythmOverlay render-loop registration', () => {
  beforeEach(() => {
    mockRegister.mockReturnValue(() => {});
    mockUseRhythmAnchor.mockReturnValue(null);
    stubCanvasContext();
  });

  it('never reports dirty while there is no anchor', () => {
    const callback = renderOverlay();

    expect(callback.peekDirty()).toBe(false);
    // Frames still run for other reasons (any scroll marks the whole loop
    // dirty); this one must not be what keeps them running.
    runFrame(callback);
    expect(callback.peekDirty()).toBe(false);
  });

  it('settles to not-dirty after drawing a grid once', () => {
    mockUseRhythmAnchor.mockReturnValue({
      trackId: 'track-1',
      gridTimes: [0, 0.5, 1],
      startTime: 0,
    });

    const callback = renderOverlay();

    expect(callback.peekDirty()).toBe(true);
    runFrame(callback);
    expect(callback.peekDirty()).toBe(false);
  });

  it('reports dirty once more when the anchor disappears, then settles', () => {
    mockUseRhythmAnchor.mockReturnValue({
      trackId: 'track-1',
      gridTimes: [0, 0.5, 1],
      startTime: 0,
    });
    const { rerender } = render(
      <RhythmOverlay pixelsPerSecond={200} tracks={[]} />,
    );
    runFrame(registeredCallback());

    // Muting the anchor (or deleting it) must actually erase the rungs —
    // so exactly one more frame is owed, and no more after it.
    mockUseRhythmAnchor.mockReturnValue(null);
    rerender(<RhythmOverlay pixelsPerSecond={200} tracks={[]} />);

    const callback = registeredCallback();
    expect(callback.peekDirty()).toBe(true);
    runFrame(callback);
    expect(callback.peekDirty()).toBe(false);
  });
});
