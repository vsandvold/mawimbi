import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHORT_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-short.wav');
const LONG_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-long.wav');

/**
 * Creates a Playwright ElementHandle for a DataTransfer containing the given
 * audio files. Pass the handle to page.dispatchEvent() as { dataTransfer }.
 */
async function createAudioDataTransfer(
  page: import('@playwright/test').Page,
  filePaths: string[],
) {
  const files = filePaths.map((filePath) => ({
    buffer: Array.from(fs.readFileSync(filePath)),
    name: path.basename(filePath),
    type: 'audio/wav',
  }));

  return page.evaluateHandle((fileList) => {
    const dt = new DataTransfer();
    for (const f of fileList) {
      const blob = new Blob([new Uint8Array(f.buffer)], { type: f.type });
      dt.items.add(new File([blob], f.name, { type: f.type }));
    }
    return dt;
  }, files);
}

/**
 * Creates a DataTransfer containing a plain-text file (not audio), to test
 * the rejection state.
 */
async function createNonAudioDataTransfer(
  page: import('@playwright/test').Page,
) {
  return page.evaluateHandle(() => {
    const dt = new DataTransfer();
    const blob = new Blob(['hello world'], { type: 'text/plain' });
    dt.items.add(new File([blob], 'notes.txt', { type: 'text/plain' }));
    return dt;
  });
}

/** Dispatches dragenter + dragover on the editor drop target. */
async function dragOver(
  page: import('@playwright/test').Page,
  dataTransfer: Awaited<ReturnType<typeof createAudioDataTransfer>>,
) {
  await page.dispatchEvent('.editor', 'dragenter', { dataTransfer });
  await page.dispatchEvent('.editor', 'dragover', { dataTransfer });
}

/** Dispatches drop + dragleave on the editor drop target. */
async function drop(
  page: import('@playwright/test').Page,
  dataTransfer: Awaited<ReturnType<typeof createAudioDataTransfer>>,
) {
  await page.dispatchEvent('.editor', 'drop', { dataTransfer });
  await page.dispatchEvent('.editor', 'dragleave', { dataTransfer });
}

test.describe('Drag and drop – overlay visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
  });

  test('dropzone overlay is hidden before any drag', async ({ page }) => {
    await expect(page.locator('.editor__dropzone')).toHaveClass(
      /editor__dropzone--hidden/,
    );
  });

  test('dropzone overlay appears when dragging audio files over the editor', async ({
    page,
  }) => {
    const dt = await createAudioDataTransfer(page, [SHORT_AUDIO]);
    await dragOver(page, dt);

    await expect(page.locator('.editor__dropzone')).not.toHaveClass(
      /editor__dropzone--hidden/,
    );
  });

  test('dropzone overlay disappears when drag leaves the editor', async ({
    page,
  }) => {
    const dt = await createAudioDataTransfer(page, [SHORT_AUDIO]);
    await dragOver(page, dt);
    await expect(page.locator('.editor__dropzone')).not.toHaveClass(
      /editor__dropzone--hidden/,
    );

    await page.dispatchEvent('.editor', 'dragleave', { dataTransfer: dt });

    await expect(page.locator('.editor__dropzone')).toHaveClass(
      /editor__dropzone--hidden/,
    );
  });
});

test.describe('Drag and drop – accept / reject states', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
  });

  test('shows accept styling and hint text for valid audio files', async ({
    page,
  }) => {
    const dt = await createAudioDataTransfer(page, [SHORT_AUDIO]);
    await dragOver(page, dt);

    await expect(page.locator('.dropzone')).toHaveClass(/dropzone--accept/);
    await expect(
      page.getByText('Drag and drop audio files here'),
    ).toBeVisible();
  });

  test('shows reject styling and hint text for non-audio files', async ({
    page,
  }) => {
    const dt = await createNonAudioDataTransfer(page);
    await dragOver(page, dt);

    await expect(page.locator('.dropzone')).toHaveClass(/dropzone--reject/);
    await expect(
      page.getByText('Oops, this does not look like an audio file'),
    ).toBeVisible();
  });
});

test.describe('Drag and drop – file upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
  });

  test('dropping an audio file creates a track in the timeline', async ({
    page,
  }) => {
    const dt = await createAudioDataTransfer(page, [SHORT_AUDIO]);
    await dragOver(page, dt);
    await drop(page, dt);

    await expect(
      page.getByText('Start recording, or upload some audio files'),
    ).toBeHidden();
    await expect(page.locator('.timeline__waveform')).toBeVisible();
  });

  test('dropping multiple audio files creates one track per file', async ({
    page,
  }) => {
    const dt = await createAudioDataTransfer(page, [SHORT_AUDIO, LONG_AUDIO]);
    await dragOver(page, dt);
    await drop(page, dt);

    await expect(page.locator('.timeline__waveform')).toHaveCount(2);
  });

  test('enables play and mixer buttons after a successful drop', async ({
    page,
  }) => {
    await expect(page.getByTitle('Play')).toBeDisabled();
    await expect(page.getByTitle('Show mixer')).toBeDisabled();

    const dt = await createAudioDataTransfer(page, [SHORT_AUDIO]);
    await dragOver(page, dt);
    await drop(page, dt);

    await expect(page.locator('.timeline__waveform')).toBeVisible();
    await expect(page.getByTitle('Play')).toBeEnabled();
    await expect(page.getByTitle('Show mixer')).toBeEnabled();
  });

  test('rejected files are not added to the timeline', async ({ page }) => {
    const dt = await createNonAudioDataTransfer(page);
    await dragOver(page, dt);
    await drop(page, dt);

    // The empty state should still be visible – nothing was added
    await expect(
      page.getByText('Start recording, or upload some audio files'),
    ).toBeVisible();
    await expect(page.locator('.timeline__waveform')).toHaveCount(0);
  });
});

test.describe('Visual regression – drag and drop states', () => {
  test.beforeEach(async ({ page }) => {
    // Pin Math.random so track colours are deterministic across runs.
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
  });

  test('dropzone overlay in accept state', async ({ page }) => {
    await page.goto('/project');
    const dt = await createAudioDataTransfer(page, [SHORT_AUDIO]);
    await dragOver(page, dt);

    await expect(page.locator('.dropzone--accept')).toBeVisible();
    await expect(page.locator('.editor')).toHaveScreenshot(
      'dropzone-accept-state.png',
    );
  });

  test('dropzone overlay in reject state', async ({ page }) => {
    await page.goto('/project');
    const dt = await createNonAudioDataTransfer(page);
    await dragOver(page, dt);

    await expect(page.locator('.dropzone--reject')).toBeVisible();
    await expect(page.locator('.editor')).toHaveScreenshot(
      'dropzone-reject-state.png',
    );
  });
});
