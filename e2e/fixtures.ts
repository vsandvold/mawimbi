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
 */
import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend<{ blockModelRequests: void }>({
  // eslint-disable-next-line no-empty-pattern
  blockModelRequests: [async ({ page }, use) => {
    await page.route('**/models/*.onnx', (route) =>
      route.fulfill({ status: 200, body: '' }),
    );
    await use();
  }, { auto: true }],
});
