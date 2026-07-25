import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Instrument identity is session-only in the classification service and
 * persisted only on the track record, so every bug in this area is a reload
 * bug — invisible until the service cache is cold. This spec exercises that
 * crossing end to end: choose a label, reload, and it is still the label.
 */
test.describe('Instrument persistence across page reload', () => {
  const CHOSEN_INSTRUMENT = 'Drums';
  const CLASSIFICATION_SETTLE_TIMEOUT_MS = 15_000;

  /**
   * Reads the instrument the auto-save has actually committed for a track.
   * Polling this replaces a wait calibrated to the auto-save debounce, which
   * would be a blind wait (CLAUDE.md's e2e rules, #367/#386) and would fail as
   * "the instrument did not survive" on a slow machine — indistinguishable
   * from a real regression.
   */
  function readPersistedInstrument(page: Page) {
    return page.evaluate(
      () =>
        new Promise<string | undefined>((resolve, reject) => {
          const request = indexedDB.open('mawimbi-db');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('projects')) {
              db.close();
              resolve(undefined);
              return;
            }
            const tx = db.transaction(['projects'], 'readonly');
            const projects = tx.objectStore('projects').getAll();
            tx.oncomplete = () => {
              db.close();
              const saved = projects.result as {
                tracks: { instrument?: string }[];
              }[];
              resolve(
                saved.flatMap((project) => project.tracks)[0]?.instrument,
              );
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          };
        }),
    );
  }

  async function openMixer(page: Page) {
    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toBeVisible();
  }

  test('a chosen instrument survives a reload', async ({ page }) => {
    await page.goto('/project/test-instrument-persistence');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    await openMixer(page);
    const instrumentButton = page.locator('.channel__instrument');
    // Models are blocked by the shared fixture, so classification settles into
    // its error state rather than producing a label — the dropdown below is
    // then the only source of one, which is exactly the case that regressed.
    await expect(instrumentButton.locator('.animate-spin')).toBeHidden({
      timeout: CLASSIFICATION_SETTLE_TIMEOUT_MS,
    });

    await instrumentButton.click();
    await page.getByRole('menuitem', { name: CHOSEN_INSTRUMENT }).click();
    await expect(instrumentButton).toHaveAttribute('title', CHOSEN_INSTRUMENT);

    await expect
      .poll(() => readPersistedInstrument(page))
      .toBe(CHOSEN_INSTRUMENT.toLowerCase());

    // A restored track must not be re-classified: the label is already known,
    // and the re-run is what used to overwrite it. The service logs every run
    // it starts, so counting those messages observes the inference itself
    // rather than the spinner, which is gone again by the time a test could
    // look for it.
    const classificationRuns: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('[classification] Classifying track')) {
        classificationRuns.push(message.text());
      }
    });

    await page.reload();
    await expect(page.locator('.timeline__track')).toBeVisible({
      timeout: 10_000,
    });

    await openMixer(page);
    await expect(page.locator('.channel__instrument')).toHaveAttribute(
      'title',
      CHOSEN_INSTRUMENT,
    );
    expect(classificationRuns).toEqual([]);
  });
});
