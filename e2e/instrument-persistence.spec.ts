import { expect, test, uploadAudioFile, LONG_AUDIO_10S } from './fixtures';
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

  test('a chosen instrument survives a reload and is not re-classified', async ({
    page,
  }) => {
    // Every run the service starts announces itself, which observes the
    // inference rather than the spinner — the spinner is gone again long
    // before a test could look for it.
    let classificationRuns = 0;
    page.on('console', (message) => {
      if (message.text().includes('[classification] Classifying track')) {
        classificationRuns += 1;
      }
    });

    await page.goto('/project/test-instrument-persistence');
    // Must exceed the service's 2.1s minimum: a shorter clip is skipped before
    // inference is ever attempted, which would make the "not re-classified"
    // assertion below pass whether or not the restore path hydrates.
    await uploadAudioFile(page, LONG_AUDIO_10S);
    await expect(page.locator('.timeline__track')).toBeVisible();

    await openMixer(page);
    const instrumentButton = page.locator('.channel__instrument');
    // Models are served empty by the shared fixture, so this run reaches
    // inference and fails there — leaving the track with no label, which is
    // what makes the dropdown below its only source of one.
    await expect(instrumentButton.locator('.animate-spin')).toBeHidden({
      timeout: CLASSIFICATION_SETTLE_TIMEOUT_MS,
    });
    // Positive control for the assertion after the reload: the upload really
    // does reach inference with this fixture.
    expect(classificationRuns).toBe(1);

    await instrumentButton.click();
    await page.getByRole('menuitem', { name: CHOSEN_INSTRUMENT }).click();
    await expect(instrumentButton).toHaveAttribute('title', CHOSEN_INSTRUMENT);

    await expect
      .poll(() => readPersistedInstrument(page))
      .toBe(CHOSEN_INSTRUMENT.toLowerCase());

    classificationRuns = 0;
    await page.reload();
    // ProjectPage renders nothing until the restore finishes, so a visible
    // track means every restored track has already been through the
    // onTrackCreated hook that used to start a fresh classification.
    await expect(page.locator('.timeline__track')).toBeVisible({
      timeout: 10_000,
    });

    await openMixer(page);
    await expect(page.locator('.channel__instrument')).toHaveAttribute(
      'title',
      CHOSEN_INSTRUMENT,
    );
    expect(classificationRuns).toBe(0);
  });
});
