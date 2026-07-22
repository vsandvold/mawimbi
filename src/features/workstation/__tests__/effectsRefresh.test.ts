import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadSpectrogramData,
  resetDB,
} from '../../project/ProjectStorageService';
import { type SpectrogramData } from '../../spectrogram/OfflineAnalyser';
import { type SpectrogramResult } from '../../spectrogram/SpectrogramCache';
import { type EffectAmounts } from '../../tracks/EffectsChain';
import { type TrackColor } from '../../tracks/types';
import {
  EFFECTS_REFRESH_DEBOUNCE_MS,
  EffectsRefreshScheduler,
} from '../effectsRefresh';

const COLOR: TrackColor = { r: 1, g: 2, b: 3 };
const TRACK_ID = 'track-1';

const AMOUNTS_A: EffectAmounts = { space: 10, echo: 0, tone: 0 };
const AMOUNTS_B: EffectAmounts = { space: 50, echo: 0, tone: 0 };
const AMOUNTS_C: EffectAmounts = { space: 90, echo: 0, tone: 0 };

function mockAudioBuffer(marker: string): AudioBuffer {
  return { marker } as unknown as AudioBuffer;
}

function spectrogramDataFor(marker: string): SpectrogramData {
  return {
    frequencyFrames: [new Uint8Array([marker.charCodeAt(0)])],
    timeResolution: 0.025,
    frequencyBinCount: 1,
    sampleRate: 44100,
    duration: 1,
    totalFrames: 1,
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

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
  resetDB();
});

describe('EffectsRefreshScheduler debounce', () => {
  it('coalesces rapid schedule() calls for the same track into one analysis, using the latest amounts', async () => {
    const renderOffline = vi
      .fn()
      .mockResolvedValue(mockAudioBuffer('rendered'));
    const analyseToResult = vi.fn().mockResolvedValue({
      data: spectrogramDataFor('rendered'),
      tiles: [],
    } as SpectrogramResult);
    const setEntry = vi.fn();

    const scheduler = new EffectsRefreshScheduler({
      renderOffline,
      analyseToResult,
      setEntry,
    });

    const buffer = mockAudioBuffer('dry');
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_A);
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_B);
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_C);

    await waitForCallCount(renderOffline, 1);
    // No further calls arrive after the debounce window settles.
    await new Promise((resolve) =>
      setTimeout(resolve, EFFECTS_REFRESH_DEBOUNCE_MS + 100),
    );

    expect(renderOffline).toHaveBeenCalledTimes(1);
    expect(renderOffline).toHaveBeenCalledWith(buffer, AMOUNTS_C);
    expect(setEntry).toHaveBeenCalledTimes(1);
  });
});

describe('EffectsRefreshScheduler supersede-in-flight', () => {
  it('discards a stale in-flight result when a newer commit already completed', async () => {
    const renderedA = mockAudioBuffer('A');
    const renderedB = mockAudioBuffer('B');
    const deferredA = createDeferred<AudioBuffer>();
    const deferredB = createDeferred<AudioBuffer>();

    const renderOffline = vi
      .fn()
      .mockImplementationOnce(() => deferredA.promise)
      .mockImplementationOnce(() => deferredB.promise);

    const analyseToResult = vi.fn().mockImplementation(
      async (buffer: AudioBuffer): Promise<SpectrogramResult> => ({
        data: spectrogramDataFor(
          (buffer as unknown as { marker: string }).marker,
        ),
        tiles: [],
      }),
    );
    const setEntry = vi.fn();
    const onRefreshed = vi.fn();

    const scheduler = new EffectsRefreshScheduler({
      renderOffline,
      analyseToResult,
      setEntry,
      onRefreshed,
    });

    const buffer = mockAudioBuffer('dry');
    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_A);
    await waitForCallCount(renderOffline, 1); // run(A) started, awaiting deferredA

    scheduler.schedule(TRACK_ID, buffer, COLOR, AMOUNTS_B);
    await waitForCallCount(renderOffline, 2); // run(B) started, awaiting deferredB

    // The newer commit (B) finishes first...
    deferredB.resolve(renderedB);
    await waitForCallCount(setEntry, 1);

    // ...then the stale, slower commit (A) finally resolves — its result
    // must not overwrite B's, which already landed.
    deferredA.resolve(renderedA);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(setEntry).toHaveBeenCalledTimes(1);
    expect(setEntry).toHaveBeenCalledWith(
      TRACK_ID,
      expect.objectContaining({ data: spectrogramDataFor('B') }),
      expect.any(String),
    );
    expect(onRefreshed).toHaveBeenCalledTimes(1);
    expect(onRefreshed).toHaveBeenCalledWith(TRACK_ID);
  });
});

describe('EffectsRefreshScheduler persistence', () => {
  it('persists the refreshed spectrogram with a hash of the committed amounts', async () => {
    const renderOffline = vi
      .fn()
      .mockResolvedValue(mockAudioBuffer('rendered'));
    const analyseToResult = vi.fn().mockResolvedValue({
      data: spectrogramDataFor('rendered'),
      tiles: [],
    } as SpectrogramResult);
    const setEntry = vi.fn();

    const scheduler = new EffectsRefreshScheduler({
      renderOffline,
      analyseToResult,
      setEntry,
    });

    scheduler.schedule(TRACK_ID, mockAudioBuffer('dry'), COLOR, AMOUNTS_A);
    await waitForCallCount(setEntry, 1);
    // Persistence is awaited inside run(), after setEntry — give it a beat.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stored = await loadSpectrogramData(TRACK_ID);
    expect(stored).not.toBeNull();
    expect(stored!.effectsParamsHash).toBe('10:0:0');
  });

  // mawimbi#540 (spec 006 M3) — the committed refresh's raw frames must
  // also release once persisted, same as the mount-time analysis paths.
  it('releases raw frames after persisting, before notifying onRefreshed', async () => {
    const renderOffline = vi
      .fn()
      .mockResolvedValue(mockAudioBuffer('rendered'));
    const analyseToResult = vi.fn().mockResolvedValue({
      data: spectrogramDataFor('rendered'),
      tiles: [],
    } as SpectrogramResult);
    const setEntry = vi.fn();
    const releaseFrames = vi.fn();
    const onRefreshed = vi.fn();

    const scheduler = new EffectsRefreshScheduler({
      renderOffline,
      analyseToResult,
      setEntry,
      releaseFrames,
      onRefreshed,
    });

    scheduler.schedule(TRACK_ID, mockAudioBuffer('dry'), COLOR, AMOUNTS_A);
    await waitForCallCount(onRefreshed, 1);

    expect(releaseFrames).toHaveBeenCalledOnce();
    expect(releaseFrames).toHaveBeenCalledWith(TRACK_ID);
    // Order matters: onRefreshed's setEntry(getEntry(id)) must observe the
    // already-released entry, not race it.
    const releaseOrder = releaseFrames.mock.invocationCallOrder[0];
    const refreshedOrder = onRefreshed.mock.invocationCallOrder[0];
    expect(releaseOrder).toBeLessThan(refreshedOrder);
  });

  // Code review finding (mawimbi#540 follow-up): a request whose own
  // `saveSpectrogramData` is still pending must not re-fire releaseFrames/
  // onRefreshed after a newer request for the same track has already
  // completed in full — the tail lacked the same isSuperseded() guard the
  // two earlier async stages already had.
  it('does not re-fire releaseFrames/onRefreshed for a request superseded while its own save is still pending', async () => {
    const renderOffline = vi
      .fn()
      .mockImplementation((buffer: AudioBuffer) => Promise.resolve(buffer));
    const analyseToResult = vi.fn().mockImplementation(
      async (buffer: AudioBuffer): Promise<SpectrogramResult> => ({
        data: spectrogramDataFor(
          (buffer as unknown as { marker: string }).marker,
        ),
        tiles: [],
      }),
    );
    const setEntry = vi.fn();
    const releaseFrames = vi.fn();
    const onRefreshed = vi.fn();

    const deferredSaveA = createDeferred<void>();
    const saveSpy = vi.spyOn(
      await import('../../project/ProjectStorageService'),
      'saveSpectrogramData',
    );
    let saveCallCount = 0;
    saveSpy.mockImplementation(() => {
      saveCallCount++;
      // Request A's save stalls; request B's resolves immediately.
      return saveCallCount === 1 ? deferredSaveA.promise : Promise.resolve();
    });

    const scheduler = new EffectsRefreshScheduler({
      renderOffline,
      analyseToResult,
      setEntry,
      releaseFrames,
      onRefreshed,
    });

    // Request A: reaches its (stalled) save and stops there.
    scheduler.schedule(TRACK_ID, mockAudioBuffer('A'), COLOR, AMOUNTS_A);
    await waitForCallCount(setEntry, 1);

    // Request B for the same track, fully completes (its own save resolves
    // immediately) while A's save is still pending.
    scheduler.schedule(TRACK_ID, mockAudioBuffer('B'), COLOR, AMOUNTS_B);
    await waitForCallCount(setEntry, 2);
    await waitForCallCount(releaseFrames, 1);
    await waitForCallCount(onRefreshed, 1);

    // A's stalled save finally resolves — A is now superseded by B.
    deferredSaveA.resolve();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // A's late completion must not trigger a second release/refresh.
    expect(releaseFrames).toHaveBeenCalledOnce();
    expect(onRefreshed).toHaveBeenCalledOnce();

    saveSpy.mockRestore();
  });

  it('still releases frames and notifies onRefreshed when persisting fails', async () => {
    const renderOffline = vi
      .fn()
      .mockResolvedValue(mockAudioBuffer('rendered'));
    const analyseToResult = vi.fn().mockResolvedValue({
      data: spectrogramDataFor('rendered'),
      tiles: [],
    } as SpectrogramResult);
    const setEntry = vi.fn();
    const releaseFrames = vi.fn();
    const onRefreshed = vi.fn();

    const saveSpy = vi
      .spyOn(
        await import('../../project/ProjectStorageService'),
        'saveSpectrogramData',
      )
      .mockRejectedValueOnce(new Error('quota exceeded'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const scheduler = new EffectsRefreshScheduler({
      renderOffline,
      analyseToResult,
      setEntry,
      releaseFrames,
      onRefreshed,
    });

    scheduler.schedule(TRACK_ID, mockAudioBuffer('dry'), COLOR, AMOUNTS_A);
    await waitForCallCount(onRefreshed, 1);

    expect(releaseFrames).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalled();

    saveSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('EffectsRefreshScheduler dispose', () => {
  it('cancels a pending debounced run and drops an already in-flight one', async () => {
    const deferred = createDeferred<AudioBuffer>();
    const renderOffline = vi.fn().mockReturnValue(deferred.promise);
    const analyseToResult = vi.fn().mockResolvedValue({
      data: spectrogramDataFor('x'),
      tiles: [],
    } as SpectrogramResult);
    const setEntry = vi.fn();

    const scheduler = new EffectsRefreshScheduler({
      renderOffline,
      analyseToResult,
      setEntry,
    });

    scheduler.schedule(TRACK_ID, mockAudioBuffer('dry'), COLOR, AMOUNTS_A);
    await waitForCallCount(renderOffline, 1);

    scheduler.dispose();
    deferred.resolve(mockAudioBuffer('rendered'));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(setEntry).not.toHaveBeenCalled();
  });
});
