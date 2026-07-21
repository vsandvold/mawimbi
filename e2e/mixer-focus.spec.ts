import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO,
  SHORT_AUDIO,
} from './fixtures';

/**
 * Mixer-driven timeline focus: touching a channel's fader or dragging a
 * channel to reorder lifts that track in the timeline (--foreground) and
 * dims the rest (--background); releasing always reverts. The focus
 * lifecycle is pointer-driven (why: useChannelControls) — the stuck-focus
 * bug this spec pins happened because unfocus only ran from Radix's
 * onValueCommit, which never fires for a press-and-release without a
 * value change.
 */

// Horizontal fader drag distance — arbitrary, just comfortably larger
// than any activation threshold.
const FADER_DRAG_DELTA_PX = 40;
// Small first move that activates @dnd-kit's PointerSensor (PRs #92/#97).
const DND_ACTIVATION_NUDGE_PX = 5;
// Distance dragged before the mid-drag assertions run — enough that the
// drag is unambiguously under way, small enough to stay over the mixer.
const MID_DRAG_OFFSET_PX = 20;
// Stepped, frame-paced movement so dnd-kit processes the drag (PRs #92/#97).
const DRAG_STEPS = 8;
const FRAME_MS = 16;

type Page = import('@playwright/test').Page;
type Locator = import('@playwright/test').Locator;

async function setUpTwoTracksWithMixer(page: Page) {
  await page.goto('/project/test-id');
  await uploadAudioFile(page, LONG_AUDIO);
  await expect(page.locator('.timeline__track')).toHaveCount(1);
  await uploadAudioFile(page, SHORT_AUDIO);
  await expect(page.locator('.timeline__track')).toHaveCount(2);

  await page.getByTitle('Show mixer').click();
  await expect(page.locator('.channel')).toHaveCount(2);
  await waitForSettledPosition(page.locator('.channel').first());
}

/**
 * Polls until two consecutive boundingBox reads (one frame apart) agree —
 * the sheet's slide-in has settled and coordinates are safe to use for
 * raw mouse input. Replaces a blind animation-duration wait (#367, #386).
 */
async function waitForSettledPosition(locator: Locator) {
  await expect(async () => {
    const before = await locator.boundingBox();
    await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
    const after = await locator.boundingBox();
    expect(before).not.toBeNull();
    expect(after).toEqual(before);
  }).toPass();
}

function faderThumb(page: Page) {
  // Mixer rows are reversed: first channel = newest track = last timeline
  // track.
  return page
    .locator('.mixer__channel')
    .first()
    .locator('[data-slot="slider-thumb"]');
}

async function expectFocusCleared(page: Page) {
  const tracks = page.locator('.timeline__track');
  await expect(tracks.last()).not.toHaveClass(/timeline__track--foreground/);
  await expect(tracks.first()).not.toHaveClass(/timeline__track--background/);
}

/** Frame-paced stepped mouse movement (dnd-kit needs time-spaced moves). */
async function pacedMouseMove(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  for (let i = 1; i <= DRAG_STEPS; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / DRAG_STEPS,
      from.y + ((to.y - from.y) * i) / DRAG_STEPS,
    );
    await page.waitForTimeout(FRAME_MS);
  }
}

test.describe('Mixer-driven timeline focus', () => {
  test.beforeEach(async ({ page }) => {
    await setUpTwoTracksWithMixer(page);
  });

  test('pressing and releasing the fader thumb without moving clears the focus', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const box = (await faderThumb(page).boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(tracks.last()).toHaveClass(/timeline__track--foreground/);
    await expect(tracks.first()).toHaveClass(/timeline__track--background/);

    await page.mouse.up();

    await expectFocusCleared(page);
  });

  test('dragging the fader and releasing clears the focus', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const box = (await faderThumb(page).boundingBox())!;
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - FADER_DRAG_DELTA_PX, startY, { steps: 5 });
    await expect(tracks.last()).toHaveClass(/timeline__track--foreground/);

    await page.mouse.up();

    await expectFocusCleared(page);
  });

  test('right-clicking the fader does not focus (no release event would ever clear it)', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const box = (await faderThumb(page).boundingBox())!;

    // A right-button press opens the native context menu, which swallows
    // the matching pointerup in real browsers — so a non-primary press
    // must never start a focus in the first place.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'right' });

    await expect(tracks.last()).not.toHaveClass(
      /timeline__track--foreground/,
    );
    await expect(tracks.first()).not.toHaveClass(
      /timeline__track--background/,
    );

    await page.mouse.up({ button: 'right' });
  });

  test('drag-reordering a channel lifts its track while dragging and reverts on drop', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const handles = page.locator('.channel__move');
    const sourceBox = (await handles.first().boundingBox())!;
    const targetBox = (await handles.last().boundingBox())!;
    const startX = sourceBox.x + sourceBox.width / 2;
    const startY = sourceBox.y + sourceBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + DND_ACTIVATION_NUDGE_PX);
    const midDrag = { x: startX, y: startY + MID_DRAG_OFFSET_PX };
    await pacedMouseMove(page, { x: startX, y: startY }, midDrag);

    // The dragged channel is the newest track = last timeline track.
    await expect(tracks.last()).toHaveClass(/timeline__track--foreground/);
    // Not yet over the other channel's row — flat background dim, no live
    // target highlight.
    await expect(tracks.first()).toHaveClass(/timeline__track--background/);
    await expect(tracks.first()).not.toHaveClass(
      /timeline__track--drag-target/,
    );

    await pacedMouseMove(page, midDrag, {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    });

    // Crossing into the other channel's row live-highlights its track —
    // an intermediate tier between background and foreground, not the
    // flat dim every other (non-crossed) track still gets.
    await expect(tracks.first()).toHaveClass(/timeline__track--drag-target/);
    await expect(tracks.first()).not.toHaveClass(
      /timeline__track--background/,
    );

    await page.mouse.up();

    await expectFocusCleared(page);
    await expect(tracks.first()).not.toHaveClass(
      /timeline__track--drag-target/,
    );
  });

  test('drag-reordering a muted channel reveals and lifts its track', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const mutedTrack = tracks.last();

    // Mute the newest track (top mixer row); its state button cycles
    // on → solo → mute.
    const newestChannel = page.locator('.mixer__channel').first();
    await newestChannel.getByTitle('On').click();
    await expect(newestChannel.getByTitle('Solo')).toBeVisible();
    await newestChannel.getByTitle('Solo').click();
    await expect(newestChannel.getByTitle('Muted')).toBeVisible();
    await expect(mutedTrack).toHaveClass(/timeline__track--muted/);

    const handles = page.locator('.channel__move');
    const sourceBox = (await handles.first().boundingBox())!;
    const startX = sourceBox.x + sourceBox.width / 2;
    const startY = sourceBox.y + sourceBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + DND_ACTIVATION_NUDGE_PX);
    await pacedMouseMove(
      page,
      { x: startX, y: startY },
      { x: startX, y: startY + MID_DRAG_OFFSET_PX },
    );

    // Dragging must not dim every other track while lifting nothing — the
    // focused track is revealed for the duration of the interaction, same
    // as edit mode treats a muted active track.
    await expect(mutedTrack).toHaveClass(/timeline__track--foreground/);
    await expect(mutedTrack).not.toHaveClass(/timeline__track--muted/);
    await expect(tracks.first()).toHaveClass(/timeline__track--background/);

    await page.mouse.up();

    await expect(mutedTrack).toHaveClass(/timeline__track--muted/);
    await expect(mutedTrack).not.toHaveClass(/timeline__track--foreground/);
  });
});
