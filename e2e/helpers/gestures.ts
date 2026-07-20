/**
 * Shared CDP touch-gesture helpers for e2e specs that exercise the
 * scrubber's touch paths. Playwright's mouse API cannot drive touch input
 * (CLAUDE.md, "Touch gestures"), so these dispatch raw CDP touch events at
 * `.scrubber__phantom` — the untransformed overlay that captures all scroll
 * interactions and whose bounding box isn't distorted by the runway's 3D
 * transform (unlike the tilted content beneath it).
 */
import type { Page } from '@playwright/test';

const GESTURE_STEP_MS = 20;
const PINCH_STEPS = 10;
const PINCH_INITIAL_HALF_DISTANCE_PX = 40;

async function getPhantomCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('.scrubber__phantom').boundingBox();
  if (!box) throw new Error('Phantom scroller not visible');
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

/**
 * Taps the timeline: a touchstart held for `holdMs` then a touchend, with no
 * movement in between. Mirrors a real finger tap, including the dwell time
 * that a resting finger leaves on the phantom before lifting.
 */
export async function touchTap(page: Page, holdMs: number): Promise<void> {
  const { x, y } = await getPhantomCenter(page);
  const client = await page.context().newCDPSession(page);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(holdMs);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await client.detach();
}

/**
 * Simulates a vertical touch-swipe on the timeline, mirroring what a real
 * user does when dragging the timeline with their finger.
 */
export async function swipeTimeline(page: Page, deltaY: number): Promise<void> {
  const { x: startX, y: startY } = await getPhantomCenter(page);
  const endY = startY - deltaY;
  const steps = 5;

  const client = await page.context().newCDPSession(page);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY }],
  });

  for (let i = 1; i <= steps; i++) {
    const currentY = Math.round(startY + ((endY - startY) * i) / steps);
    await page.waitForTimeout(GESTURE_STEP_MS);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX, y: currentY }],
    });
  }

  await page.waitForTimeout(GESTURE_STEP_MS);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await client.detach();
}

/**
 * Simulates a two-finger pinch on the timeline, moving both touch points
 * apart (scale > 1) or together (scale < 1) from an initial separation
 * around the phantom's center — mirroring `useTimelineZoom`'s
 * distance-ratio zoom calculation.
 */
export async function pinchTimeline(page: Page, scale: number): Promise<void> {
  const { x, y: centerY } = await getPhantomCenter(page);
  const startHalfDistance = PINCH_INITIAL_HALF_DISTANCE_PX;
  const endHalfDistance = startHalfDistance * scale;

  const client = await page.context().newCDPSession(page);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x, y: centerY - startHalfDistance },
      { x, y: centerY + startHalfDistance },
    ],
  });

  for (let i = 1; i <= PINCH_STEPS; i++) {
    const halfDistance =
      startHalfDistance +
      ((endHalfDistance - startHalfDistance) * i) / PINCH_STEPS;
    await page.waitForTimeout(GESTURE_STEP_MS);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x, y: centerY - halfDistance },
        { x, y: centerY + halfDistance },
      ],
    });
  }

  await page.waitForTimeout(GESTURE_STEP_MS);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await client.detach();
}
