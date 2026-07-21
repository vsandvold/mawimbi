/**
 * Shared recording-flow helpers for e2e specs that drive the record button:
 * spying on AudioContext construction, confirming it reaches 'running', and
 * arming/counting-in/recording/stopping. Extracted from `recording.spec.ts`
 * so `recording-pitch.spec.ts` (mawimbi#522) doesn't duplicate the same
 * choreography.
 */
import type { Page } from '@playwright/test';
import { expect } from '../fixtures';

type SpyWindow = Window & { __audioContexts: AudioContext[] };

/**
 * Intercepts AudioContext construction so ensureAudioContextRunning() can
 * verify the context state after Tone.start(). Must be called before
 * page.goto() so the init script runs before the application creates its
 * AudioContext.
 */
export async function installAudioContextSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const captured: AudioContext[] = [];
    Object.defineProperty(window, '__audioContexts', { value: captured });
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        captured.push(this);
      }
    } as typeof AudioContext;
  });
}

/**
 * Ensures the Tone.js AudioContext is running before performing audio operations.
 *
 * AudioService.startAudio() installs a click handler on window that calls
 * Tone.start(). Clicking the toolbar area triggers this handler without
 * interfering with the dropzone file dialog on the editor area.
 *
 * After clicking, we poll the captured AudioContext state to confirm it
 * reached 'running'. This replaces a blind waitForTimeout(500) that could
 * mask a regression where the context stays 'suspended' (e.g. Tone.start()
 * removed, or the click listener never fires).
 *
 * Note: --autoplay-policy=no-user-gesture-required means Chrome may start
 * contexts in 'running' state automatically. The check still guards against
 * context creation failures or unexpected 'closed' / 'suspended' states.
 */
export async function ensureAudioContextRunning(page: Page): Promise<void> {
  await page.locator('.toolbar-dock').click();

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const ctxs = (window as unknown as SpyWindow).__audioContexts;
          if (!ctxs || ctxs.length === 0) return null;
          return ctxs[ctxs.length - 1].state;
        }),
      { message: 'AudioContext did not reach running state', timeout: 3000 },
    )
    .toBe('running');
}

/**
 * Records audio for the given duration by opening the recording drawer
 * (spec 005 milestone 2), clicking its Record control to start, waiting
 * for the count-in to finish, recording for the specified duration, then
 * clicking the drawer's Stop control to stop.
 *
 * The toolbar mic button only opens/closes the drawer now — arming lives
 * inside it (RecordingBottomSheet) — so this is a two-step interaction
 * where a single click used to both open and arm.
 */
export async function recordAudio(
  page: Page,
  {
    durationMs = 1000,
    expectedTrackCount = 1,
  }: { durationMs?: number; expectedTrackCount?: number } = {},
): Promise<void> {
  await page.getByTitle('Show recording').click();

  // exact: true — 'Record' is otherwise a substring match of the toolbar
  // toggle's 'Hide recording' title.
  const recordControl = page.getByTitle('Record', { exact: true });
  await expect(recordControl).toBeVisible();
  await recordControl.click();

  // Wait for the count-in overlay to appear, then disappear.
  // The count-in runs ~2 s (mic preparation + 4 beats × 500 ms).
  const countIn = page.locator('.count-in');
  await expect(countIn).toBeVisible({ timeout: 5000 });
  await expect(countIn).not.toBeVisible({ timeout: 5000 });

  await page.waitForTimeout(durationMs);
  await page.getByTitle('Stop').click();

  // Wait for async track creation (decode + channel setup) by polling
  // for the expected number of tracks in the DOM.
  await expect(page.locator('.timeline__track')).toHaveCount(
    expectedTrackCount,
    { timeout: 5000 },
  );
}
