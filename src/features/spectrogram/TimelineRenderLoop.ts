// Single shared rAF loop for every spectrogram canvas (mawimbi#541, spec 006
// milestone 4) — replaces N always-on per-track loops (one per mounted
// `Spectrogram`), each of which independently re-derived the same scroll
// position and runway CSS geometry every frame even while nothing on screen
// was changing. `Spectrogram` registers a callback pair on mount and
// unregisters on unmount; this module owns the one `requestAnimationFrame`.

import { spectrogramStats } from './SpectrogramStats';

const SCRUBBER_CLASS = 'scrubber';
const PHANTOM_SCROLLER_SELECTOR = '.scrubber__phantom';

/**
 * The canvas window's scroll/geometry-derived span, shared by every
 * registered track this frame — computed once per active frame rather than
 * once per track. Each track's own on-screen position additionally depends
 * on its container's layout offset, which is per-track and stays inside
 * that track's own measure/write callbacks (`getContentOffsetTop` in
 * `Spectrogram.tsx`).
 */
export type SharedCanvasWindow = {
  width: number;
  height: number;
  contentTop: number;
};

export type TimelineRenderCallback = {
  /**
   * True only for a recording track: its buffer accumulates one frame of
   * live audio data per rAF tick regardless of whether anything else this
   * frame looks idle — skipping ticks here would silently drop samples.
   */
  bypassIdle?: boolean;
  /**
   * Cheap, DOM-free peek at whether this callback's own inputs (tiles
   * identity, pixels-per-second, note count, …) changed since its last
   * draw. Used only to decide whether the frame as a whole is idle; the
   * callback's own `write` phase still re-checks before actually drawing.
   */
  peekDirty: () => boolean;
  /** All DOM reads for this callback, run before any callback's `write`. */
  measure: (win: SharedCanvasWindow) => void;
  /** All DOM writes for this callback, run after every callback's `measure`. */
  write: (win: SharedCanvasWindow) => void;
};

/**
 * Reads the phantom scroller's `scrollTop` — the cheapest possible signal
 * that "something moved" (no `getComputedStyle`, no layout). Doesn't force
 * layout, so this is safe to read every frame even when otherwise idle.
 */
function readPhantomScrollTop(): number {
  const phantom = document.querySelector(
    PHANTOM_SCROLLER_SELECTOR,
  ) as HTMLElement | null;
  return phantom?.scrollTop ?? 0;
}

/**
 * The more expensive geometry read (`getComputedStyle` for the runway's CSS
 * custom properties) — done at most once per active frame, replacing what
 * used to be once per mounted track. Mirrors the pre-#541 per-track
 * `getCanvasWindow` minus the per-track `containerTop` term.
 */
function computeSharedCanvasWindow(scrollTop: number): SharedCanvasWindow {
  if (import.meta.env.DEV) spectrogramStats.incrementWindowReads();

  const scrubber = document.querySelector(
    `.${SCRUBBER_CLASS}`,
  ) as HTMLElement | null;
  const width = scrubber?.clientWidth ?? window.innerWidth;
  const fallbackHeight = scrubber?.clientHeight ?? window.innerHeight;

  let windowTop = 0;
  let windowBottom = fallbackHeight;
  if (scrubber) {
    const styles = getComputedStyle(scrubber);
    const top = parseFloat(styles.getPropertyValue('--runway-window-top'));
    const bottom = parseFloat(
      styles.getPropertyValue('--runway-window-bottom'),
    );
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) {
      windowTop = top;
      windowBottom = bottom;
    }
  }

  return {
    width,
    height: Math.ceil(windowBottom - windowTop),
    contentTop: scrollTop + windowTop,
  };
}

class TimelineRenderLoop {
  private callbacks = new Map<symbol, TimelineRenderCallback>();
  private rafId: number | null = null;
  private lastScrollTop: number | null = null;

  /** Registers a callback pair and returns an unregister function. */
  register(callback: TimelineRenderCallback): () => void {
    const id = Symbol('timeline-render-loop-callback');
    this.callbacks.set(id, callback);
    this.ensureRunning();
    return () => {
      this.callbacks.delete(id);
    };
  }

  private ensureRunning(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.runFrame();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Runs one frame. Exposed (not private) so unit tests can drive frames
   * deterministically instead of racing real `requestAnimationFrame` timing.
   */
  runFrame(): void {
    if (this.callbacks.size === 0) return;

    const scrollTop = readPhantomScrollTop();
    const scrollChanged = scrollTop !== this.lastScrollTop;

    const bypassing: TimelineRenderCallback[] = [];
    let anyDirty = scrollChanged;
    for (const callback of this.callbacks.values()) {
      if (callback.bypassIdle) {
        bypassing.push(callback);
        continue;
      }
      if (callback.peekDirty()) anyDirty = true;
    }

    // Idle frame: nothing global changed and no recording track needs its
    // per-tick accumulation — return without any further DOM access.
    if (!anyDirty && bypassing.length === 0) return;

    this.lastScrollTop = scrollTop;
    const win = computeSharedCanvasWindow(scrollTop);

    const active = anyDirty ? [...this.callbacks.values()] : bypassing;
    for (const callback of active) callback.measure(win);
    for (const callback of active) callback.write(win);
  }
}

// One shared instance — every mounted `Spectrogram` (including the
// recording track) registers with this, matching the singleton pattern
// `spectrogramStats` already uses in this feature.
export const timelineRenderLoop = new TimelineRenderLoop();
export default TimelineRenderLoop;
