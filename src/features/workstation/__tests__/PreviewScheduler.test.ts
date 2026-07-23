import { describe, expect, it, vi } from 'vitest';
import * as ProjectStorageService from '../../project/ProjectStorageService';
import { type SpectrogramResult } from '../../spectrogram/SpectrogramCache';
import { type EffectAmounts } from '../../tracks/EffectsChain';
import { type TrackColor } from '../../tracks/types';
import {
  computePreviewWindowPlan,
  PREVIEW_PREROLL_SECONDS,
  PREVIEW_THROTTLE_MS,
  PREVIEW_WINDOW_MAX_SECONDS,
  PreviewScheduler,
  type PreviewWindowPlan,
} from '../effectsPreview';

const COLOR: TrackColor = { r: 1, g: 2, b: 3 };
const TRACK_ID = 'track-1';

const AMOUNTS_A: EffectAmounts = { space: 10, echo: 0, tone: 0 };
const AMOUNTS_B: EffectAmounts = { space: 50, echo: 0, tone: 0 };
const AMOUNTS_C: EffectAmounts = { space: 90, echo: 0, tone: 0 };

function mockAudioBuffer(duration: number): AudioBuffer {
  return { duration } as unknown as AudioBuffer;
}

function mockTile(): ImageBitmap {
  return {} as unknown as ImageBitmap;
}

function spectrogramResult(): SpectrogramResult {
  return {
    data: {
      frequencyFrames: [],
      timeResolution: 0.025,
      frequencyBinCount: 1,
      sampleRate: 44100,
      duration: 1,
      totalFrames: 1,
    },
    tiles: [mockTile()],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function waitForCallCount(fn: ReturnType<typeof vi.fn>, count: number) {
  const deadline = Date.now() + 2000;
  while (fn.mock.calls.length < count) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for ${count} call(s); saw ${fn.mock.calls.length}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('computePreviewWindowPlan', () => {
  it('caps the output window at PREVIEW_WINDOW_MAX_SECONDS and prepends PREVIEW_PREROLL_SECONDS of lead-in', () => {
    const plan = computePreviewWindowPlan(
      { startSeconds: 10, endSeconds: 40 },
      60,
    ) as PreviewWindowPlan;

    expect(plan).not.toBeNull();
    expect(plan.outputStartSeconds).toBe(10);
    expect(plan.outputDurationSeconds).toBe(PREVIEW_WINDOW_MAX_SECONDS);
    expect(plan.prerollSeconds).toBe(PREVIEW_PREROLL_SECONDS);
    expect(plan.renderStartSeconds).toBe(10 - PREVIEW_PREROLL_SECONDS);
    expect(plan.renderDurationSeconds).toBe(
      PREVIEW_PREROLL_SECONDS + PREVIEW_WINDOW_MAX_SECONDS,
    );
  });

  it('clips the preroll instead of reading before the track start', () => {
    const plan = computePreviewWindowPlan(
      { startSeconds: 0.5, endSeconds: 5 },
      60,
    ) as PreviewWindowPlan;

    expect(plan.prerollSeconds).toBe(0.5);
    expect(plan.renderStartSeconds).toBe(0);
  });

  it('returns null when the requested window does not intersect the track', () => {
    expect(
      computePreviewWindowPlan({ startSeconds: 70, endSeconds: 90 }, 60),
    ).toBeNull();
    expect(
      computePreviewWindowPlan({ startSeconds: -20, endSeconds: -5 }, 60),
    ).toBeNull();
  });
});

describe('PreviewScheduler throttle', () => {
  it('runs the leading tick immediately, then coalesces further ticks into one trailing run with the latest amounts', async () => {
    const renderOfflineWindow = vi.fn().mockResolvedValue(mockAudioBuffer(1));
    const analyseToResult = vi.fn().mockResolvedValue(spectrogramResult());
    const setPreview = vi.fn();
    const clearPreview = vi.fn();

    const scheduler = new PreviewScheduler({
      renderOfflineWindow,
      analyseToResult,
      setPreview,
      clearPreview,
    });

    const buffer = mockAudioBuffer(20);
    const request = { startSeconds: 0, endSeconds: 8 };
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_A, request);
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_B, request);
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_C, request);

    // Leading edge: the first call runs right away, before the throttle
    // window elapses.
    await waitForCallCount(renderOfflineWindow, 1);
    expect(renderOfflineWindow).toHaveBeenNthCalledWith(
      1,
      buffer,
      AMOUNTS_A,
      expect.anything(),
    );

    // Trailing edge: the coalesced B/C calls land once, after the throttle
    // window, using the latest (C) amounts — not one run per tick.
    await waitForCallCount(renderOfflineWindow, 2);
    await new Promise((resolve) =>
      setTimeout(resolve, PREVIEW_THROTTLE_MS + 100),
    );
    expect(renderOfflineWindow).toHaveBeenCalledTimes(2);
    expect(renderOfflineWindow).toHaveBeenNthCalledWith(
      2,
      buffer,
      AMOUNTS_C,
      expect.anything(),
    );
  });
});

describe('PreviewScheduler window capping', () => {
  it('passes renderOfflineWindow a plan capped at the window max plus preroll', async () => {
    const renderOfflineWindow = vi.fn().mockResolvedValue(mockAudioBuffer(1));
    const analyseToResult = vi.fn().mockResolvedValue(spectrogramResult());
    const setPreview = vi.fn();
    const clearPreview = vi.fn();

    const scheduler = new PreviewScheduler({
      renderOfflineWindow,
      analyseToResult,
      setPreview,
      clearPreview,
    });

    const buffer = mockAudioBuffer(60);
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_A, {
      startSeconds: 10,
      endSeconds: 40,
    });

    await waitForCallCount(renderOfflineWindow, 1);
    const plan = renderOfflineWindow.mock.calls[0][2] as PreviewWindowPlan;
    expect(plan.outputDurationSeconds).toBe(PREVIEW_WINDOW_MAX_SECONDS);
    expect(plan.prerollSeconds).toBe(PREVIEW_PREROLL_SECONDS);

    await waitForCallCount(setPreview, 1);
    expect(setPreview).toHaveBeenCalledWith(
      TRACK_ID,
      expect.objectContaining({
        startSeconds: 10,
        durationSeconds: PREVIEW_WINDOW_MAX_SECONDS,
      }),
    );
  });
});

describe('PreviewScheduler never touches the persisted spectrogram cache', () => {
  it('never calls the real saveSpectrogramData while a preview runs', async () => {
    const saveSpy = vi
      .spyOn(ProjectStorageService, 'saveSpectrogramData')
      .mockResolvedValue(undefined);
    const renderOfflineWindow = vi.fn().mockResolvedValue(mockAudioBuffer(1));
    const analyseToResult = vi.fn().mockResolvedValue(spectrogramResult());
    const setPreview = vi.fn();
    const clearPreview = vi.fn();

    const scheduler = new PreviewScheduler({
      renderOfflineWindow,
      analyseToResult,
      setPreview,
      clearPreview,
    });

    scheduler.schedule(TRACK_ID, mockAudioBuffer(20), COLOR, AMOUNTS_A, {
      startSeconds: 0,
      endSeconds: 8,
    });

    await waitForCallCount(setPreview, 1);
    expect(saveSpy).not.toHaveBeenCalled();

    saveSpy.mockRestore();
  });
});

describe('PreviewScheduler.clear', () => {
  it('clears the overlay', () => {
    const setPreview = vi.fn();
    const clearPreview = vi.fn();
    const scheduler = new PreviewScheduler({
      renderOfflineWindow: vi.fn(),
      analyseToResult: vi.fn(),
      setPreview,
      clearPreview,
    });

    scheduler.clear(TRACK_ID);

    expect(clearPreview).toHaveBeenCalledWith(TRACK_ID);
  });

  it('drops a preview result that resolves after clear() already ran (commit landed mid-flight)', async () => {
    const rendered = createDeferred<AudioBuffer>();
    const renderOfflineWindow = vi.fn().mockReturnValue(rendered.promise);
    const analyseToResult = vi.fn().mockResolvedValue(spectrogramResult());
    const setPreview = vi.fn();
    const clearPreview = vi.fn();

    const scheduler = new PreviewScheduler({
      renderOfflineWindow,
      analyseToResult,
      setPreview,
      clearPreview,
    });

    scheduler.schedule(TRACK_ID, mockAudioBuffer(20), COLOR, AMOUNTS_A, {
      startSeconds: 0,
      endSeconds: 8,
    });
    await waitForCallCount(renderOfflineWindow, 1);

    // The commit refresh lands while the preview's render is still in
    // flight — its eventual result must not overwrite the just-cleared
    // overlay.
    scheduler.clear(TRACK_ID);
    expect(clearPreview).toHaveBeenCalledTimes(1);

    rendered.resolve(mockAudioBuffer(1));
    await settle();
    await settle();

    expect(setPreview).not.toHaveBeenCalled();
    expect(clearPreview).toHaveBeenCalledTimes(1);
  });

  it('does not permanently disable future previews for a track after a drag ends', async () => {
    // Regression: `clear()` used to call the underlying throttled
    // function's `.cancel()` with no options, which (per throttle-debounce)
    // sets an internal `cancelled` flag that is never reset — every future
    // call to that same throttled wrapper silently no-ops forever. Since
    // `clear()` runs at the end of every drag (both the direct
    // commitAmount/endDrag call and the effectsParamsHash-changed effect in
    // usePreviewOverlay.ts), this made the very first drag on a track work
    // and every subsequent drag on that same track produce no preview at
    // all — confirmed against a real drag in the browser.
    const renderOfflineWindow = vi.fn().mockResolvedValue(mockAudioBuffer(1));
    const analyseToResult = vi.fn().mockResolvedValue(spectrogramResult());
    const setPreview = vi.fn();
    const clearPreview = vi.fn();

    const scheduler = new PreviewScheduler({
      renderOfflineWindow,
      analyseToResult,
      setPreview,
      clearPreview,
    });

    const buffer = mockAudioBuffer(20);
    const request = { startSeconds: 0, endSeconds: 8 };

    // First drag: a tick runs, then the drag ends (clear).
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_A, request);
    await waitForCallCount(renderOfflineWindow, 1);
    scheduler.clear(TRACK_ID);

    // Second drag on the same track must still produce a preview tick.
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_B, request);
    await waitForCallCount(renderOfflineWindow, 2);
    expect(renderOfflineWindow).toHaveBeenNthCalledWith(
      2,
      buffer,
      AMOUNTS_B,
      expect.anything(),
    );
  });
});
