/**
 * Shared Playwright fixtures that extend the base `test` object.
 *
 * All e2e tests should import `{ test, expect }` from this module instead of
 * `@playwright/test` so the shared fixtures are automatically applied.
 *
 * Current fixtures:
 * - **blockModelRequests** (auto, per-page): Intercepts `/models/*.onnx`
 *   requests and returns an empty 200 response. This prevents every test that
 *   uploads audio from downloading ~50 MB of ONNX classification models from
 *   essentia.upf.edu, which would otherwise happen because AudioService
 *   fires classification on every track creation.
 *
 * Also re-exports the shared touch-gesture helpers and the playback flap
 * tracer (`./helpers/gestures`, `./helpers/flapTracer`) so specs only need
 * one import source.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export { expect };
export * from './helpers/gestures';
export * from './helpers/flapTracer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIXTURES_DIR = path.join(__dirname, 'fixtures');
export const SHORT_AUDIO = path.join(FIXTURES_DIR, 'test-tone-short.wav');
export const LONG_AUDIO = path.join(FIXTURES_DIR, 'test-tone-long.wav');
export const LONG_AUDIO_10S = path.join(FIXTURES_DIR, 'test-tone-10s.wav');
export const CHIRP_AUDIO_10S = path.join(FIXTURES_DIR, 'test-chirp-10s.wav');
export const BURST_TAIL_AUDIO = path.join(FIXTURES_DIR, 'test-burst-tail.wav');

/**
 * Uploads an audio file via the hidden file input inside the Ant Design Upload component.
 * Waits for the file input to be attached before setting files to avoid flaky timeouts.
 */
export async function uploadAudioFile(page: Page, filePath: string) {
  const fileInput = page.locator('.toolbar-sheet input[type="file"]');
  await fileInput.waitFor({ state: 'attached' });
  await fileInput.setInputFiles(filePath);
}

/**
 * Dismisses the fullscreen overlay shown on touch-capable devices, if
 * present. Shared by every touch-gesture spec since the overlay would
 * otherwise intercept pointer/touch events meant for the timeline.
 */
export async function dismissFullscreenOverlay(page: Page) {
  const dismissButton = page.getByText('Dismiss');
  if (await dismissButton.isVisible()) {
    await dismissButton.click();
  }
  await expect(page.locator('.fullscreen__overlay')).not.toBeVisible();
}

export const test = base.extend<{ blockModelRequests: void }>({
  // eslint-disable-next-line no-empty-pattern
  blockModelRequests: [async ({ page }, use) => {
    await page.route('**/models/*.onnx', (route) =>
      route.fulfill({ status: 200, body: '' }),
    );
    await use();
  }, { auto: true }],
});
