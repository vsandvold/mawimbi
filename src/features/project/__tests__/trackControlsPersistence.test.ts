import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, beforeEach } from 'vitest';
import { hashEffectAmounts } from '../../tracks/EffectsChain';
import { type Track } from '../../tracks/types';
import {
  loadProject,
  loadSpectrogramData,
  resetDB,
  saveProject,
  saveSpectrogramData,
  type SpectrogramStoreData,
  type StoredProject,
} from '../ProjectStorageService';

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    trackId: 'track-1',
    color: { r: 77, g: 238, b: 234 },
    fileName: 'drums.wav',
    index: 0,
    ...overrides,
  };
}

function createStoredProject(
  overrides: Partial<StoredProject> = {},
): StoredProject {
  return {
    id: 'project-1',
    title: 'Test Project',
    tracks: [createTrack()],
    nextColorId: 0,
    nextIndex: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
  resetDB();
});

describe('effect settings persistence (spec 004 M5)', () => {
  it("round-trips a track's effect params through project save/load", async () => {
    const effects = { space: 25, echo: 50, tone: 75 };
    const stored = createStoredProject({
      tracks: [createTrack({ effects })],
    });

    await saveProject(stored);
    const loaded = await loadProject('project-1');

    expect(loaded!.tracks[0].effects).toEqual(effects);
  });

  it('leaves tracks with no effects set as undefined (pre-spec-004 data)', async () => {
    const stored = createStoredProject({ tracks: [createTrack()] });

    await saveProject(stored);
    const loaded = await loadProject('project-1');

    expect(loaded!.tracks[0].effects).toBeUndefined();
  });

  it("round-trips a spectrogram entry's effects params hash", async () => {
    const effects = { space: 100, echo: 0, tone: 0 };
    const hash = hashEffectAmounts(effects);
    const data: SpectrogramStoreData = {
      trackId: 'track-1',
      frequencyFrames: [new ArrayBuffer(4)],
      timeResolution: 0.025,
      frequencyBinCount: 2,
      sampleRate: 44100,
      duration: 0.05,
      effectsParamsHash: hash,
    };

    await saveSpectrogramData(data);
    const loaded = await loadSpectrogramData('track-1');

    expect(loaded!.effectsParamsHash).toBe(hash);
    // The hash restored from storage still matches a fresh computation from
    // the same amounts — this is the staleness check #494 will run on load.
    expect(loaded!.effectsParamsHash).toBe(hashEffectAmounts(effects));
  });

  it('detects staleness when the current amounts hash differs from storage', async () => {
    const storedHash = hashEffectAmounts({ space: 100, echo: 0, tone: 0 });
    await saveSpectrogramData({
      trackId: 'track-1',
      frequencyFrames: [new ArrayBuffer(4)],
      timeResolution: 0.025,
      frequencyBinCount: 2,
      sampleRate: 44100,
      duration: 0.05,
      effectsParamsHash: storedHash,
    });

    const loaded = await loadSpectrogramData('track-1');
    const currentHash = hashEffectAmounts({ space: 50, echo: 0, tone: 0 });

    expect(loaded!.effectsParamsHash).not.toBe(currentHash);
  });
});

describe('volume/mute/solo persistence (follow-up to spec 004 M5)', () => {
  it("round-trips a track's volume/mute/solo through project save/load", async () => {
    const stored = createStoredProject({
      tracks: [createTrack({ volume: 42, mute: true, solo: false })],
    });

    await saveProject(stored);
    const loaded = await loadProject('project-1');

    expect(loaded!.tracks[0].volume).toBe(42);
    expect(loaded!.tracks[0].mute).toBe(true);
    expect(loaded!.tracks[0].solo).toBe(false);
  });

  it('leaves tracks with no volume/mute/solo set as undefined (pre-existing data)', async () => {
    const stored = createStoredProject({ tracks: [createTrack()] });

    await saveProject(stored);
    const loaded = await loadProject('project-1');

    expect(loaded!.tracks[0].volume).toBeUndefined();
    expect(loaded!.tracks[0].mute).toBeUndefined();
    expect(loaded!.tracks[0].solo).toBeUndefined();
  });
});
