/**
 * Records play/pause button *transitions* over time instead of polling
 * visibility at a single instant. A visibility poll can land inside a brief
 * "playing" window and false-pass, or land just after one and false-fail —
 * both happened while diagnosing the play/pause stutter loop (kb/verification.md,
 * "State-flap bugs need transition traces"). Sampling every animation frame
 * and recording only title changes turns "is it stable" into a falsifiable
 * transition count.
 */
import type { Page } from '@playwright/test';

const PLAY_BUTTON_SELECTOR = '.floating-toolbar__button--play';

export type PlaybackTraceEntry = { t: number; title: string };

type TraceWindow = Window & {
  __playbackTrace?: PlaybackTraceEntry[];
  __playbackTraceRafId?: number;
};

/**
 * Starts an rAF sampler that records each `{t, title}` transition of the
 * play/pause button's `title` attribute ("Play" / "Pause"). Call
 * `stopPlaybackTrace` to retrieve the recorded transitions and stop
 * sampling.
 */
export async function tracePlaybackState(page: Page): Promise<void> {
  await page.evaluate(
    ({ selector }) => {
      const w = window as TraceWindow;
      w.__playbackTrace = [];
      const start = performance.now();
      // Seed the baseline from the current title so the first sampled
      // frame isn't recorded as a transition — only genuine changes after
      // tracing starts count.
      let lastTitle: string | null =
        document.querySelector(selector)?.getAttribute('title') ?? null;

      const sample = () => {
        const button = document.querySelector(selector);
        const title = button?.getAttribute('title') ?? null;
        if (title !== null && title !== lastTitle) {
          lastTitle = title;
          w.__playbackTrace?.push({ t: performance.now() - start, title });
        }
        w.__playbackTraceRafId = requestAnimationFrame(sample);
      };

      w.__playbackTraceRafId = requestAnimationFrame(sample);
    },
    { selector: PLAY_BUTTON_SELECTOR },
  );
}

/**
 * Stops the rAF sampler. Must be called even on an early failure — an
 * uncancelled loop keeps sampling for the rest of the test run, which can
 * pollute a later `tracePlaybackState` call's `__playbackTrace` array.
 */
export async function stopPlaybackTrace(
  page: Page,
): Promise<PlaybackTraceEntry[]> {
  return page.evaluate(() => {
    const w = window as TraceWindow;
    if (w.__playbackTraceRafId !== undefined) {
      cancelAnimationFrame(w.__playbackTraceRafId);
    }
    return w.__playbackTrace ?? [];
  });
}
