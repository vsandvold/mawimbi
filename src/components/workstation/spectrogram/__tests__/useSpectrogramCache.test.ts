import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpectrogramData } from '../../../../services/OfflineAnalyser';
import {
  loadSpectrogramData,
  resetDB,
  saveSpectrogramData,
  type SpectrogramStoreData,
} from '../../../../services/ProjectStorageService';
import type { TrackSpectrogramEntry } from '../../../../services/SpectrogramCache';
import { type TrackColor } from '../../../../types/track';
import {
  fromSpectrogramStoreData,
  toSpectrogramStoreData,
  useSpectrogramCache,
} from '../useSpectrogramCache';

const COLOR: TrackColor = { r: 77, g: 238, b: 234 };

const MOCK_DATA: SpectrogramData = {
  frequencyFrames: [new Uint8Array([10, 20]), new Uint8Array([30, 40])],
  timeResolution: 0.025,
  frequencyBinCount: 2,
  sampleRate: 44100,
  duration: 0.05,
};

const MOCK_ENTRY: TrackSpectrogramEntry = {
  data: MOCK_DATA,
  tiles: [],
};

const mockGetEntry = vi.fn();
const mockAnalyse = vi.fn();
const mockRestore = vi.fn();

vi.mock('../../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    spectrogramCache: {
      getEntry: mockGetEntry,
      analyse: mockAnalyse,
      restore: mockRestore,
    },
  }),
}));

function mockAudioBuffer(): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: 3,
    sampleRate: 44100,
    duration: 3 / 44100,
    getChannelData: vi.fn().mockReturnValue(new Float32Array([0.1, 0.2, 0.3])),
  } as unknown as AudioBuffer;
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
  resetDB();
  vi.clearAllMocks();
});

describe('toSpectrogramStoreData', () => {
  it('converts Uint8Array frames to ArrayBuffer copies', () => {
    const result = toSpectrogramStoreData('track-1', MOCK_DATA);

    expect(result.trackId).toBe('track-1');
    expect(result.frequencyFrames).toHaveLength(2);
    expect(result.frequencyFrames[0]).toBeInstanceOf(ArrayBuffer);
    expect(result.frequencyFrames[1]).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result.frequencyFrames[0])).toEqual(
      new Uint8Array([10, 20]),
    );
    expect(new Uint8Array(result.frequencyFrames[1])).toEqual(
      new Uint8Array([30, 40]),
    );
    expect(result.timeResolution).toBe(0.025);
    expect(result.frequencyBinCount).toBe(2);
    expect(result.sampleRate).toBe(44100);
    expect(result.duration).toBe(0.05);
  });

  it('creates independent copies of frame buffers', () => {
    const result = toSpectrogramStoreData('track-1', MOCK_DATA);

    // Mutating the stored buffer should not affect the original
    new Uint8Array(result.frequencyFrames[0])[0] = 255;
    expect(MOCK_DATA.frequencyFrames[0][0]).toBe(10);
  });
});

describe('fromSpectrogramStoreData', () => {
  it('converts ArrayBuffer frames back to Uint8Arrays', () => {
    const stored: SpectrogramStoreData = {
      trackId: 'track-1',
      frequencyFrames: [
        new Uint8Array([10, 20]).buffer.slice(0),
        new Uint8Array([30, 40]).buffer.slice(0),
      ],
      timeResolution: 0.025,
      frequencyBinCount: 2,
      sampleRate: 44100,
      duration: 0.05,
    };

    const result = fromSpectrogramStoreData(stored);

    expect(result.frequencyFrames).toHaveLength(2);
    expect(result.frequencyFrames[0]).toBeInstanceOf(Uint8Array);
    expect(result.frequencyFrames[0]).toEqual(new Uint8Array([10, 20]));
    expect(result.frequencyFrames[1]).toEqual(new Uint8Array([30, 40]));
    expect(result.timeResolution).toBe(0.025);
    expect(result.frequencyBinCount).toBe(2);
    expect(result.sampleRate).toBe(44100);
    expect(result.duration).toBe(0.05);
  });

  it('round-trips through to/from without data loss', () => {
    const stored = toSpectrogramStoreData('track-1', MOCK_DATA);
    const restored = fromSpectrogramStoreData(stored);

    expect(restored.frequencyFrames).toHaveLength(
      MOCK_DATA.frequencyFrames.length,
    );
    for (let i = 0; i < restored.frequencyFrames.length; i++) {
      expect(restored.frequencyFrames[i]).toEqual(MOCK_DATA.frequencyFrames[i]);
    }
    expect(restored.timeResolution).toBe(MOCK_DATA.timeResolution);
    expect(restored.frequencyBinCount).toBe(MOCK_DATA.frequencyBinCount);
    expect(restored.sampleRate).toBe(MOCK_DATA.sampleRate);
    expect(restored.duration).toBe(MOCK_DATA.duration);
  });
});

describe('useSpectrogramCache', () => {
  it('returns undefined when audioBuffer is not available', () => {
    const { result } = renderHook(() =>
      useSpectrogramCache('track-1', undefined, COLOR),
    );

    expect(result.current).toBeUndefined();
  });

  it('returns in-memory cached entry immediately', () => {
    mockGetEntry.mockReturnValue(MOCK_ENTRY);

    const { result } = renderHook(() =>
      useSpectrogramCache('track-1', mockAudioBuffer(), COLOR),
    );

    expect(result.current).toBe(MOCK_ENTRY);
    expect(mockAnalyse).not.toHaveBeenCalled();
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('restores from IndexedDB when available, skipping analysis', async () => {
    mockGetEntry
      .mockReturnValueOnce(undefined) // initial check: not in memory
      .mockReturnValue(MOCK_ENTRY); // after restore: entry available

    const storeData = toSpectrogramStoreData('track-1', MOCK_DATA);
    await saveSpectrogramData(storeData);

    const { result } = renderHook(() =>
      useSpectrogramCache('track-1', mockAudioBuffer(), COLOR),
    );

    await waitFor(() => {
      expect(result.current).toBe(MOCK_ENTRY);
    });

    expect(mockRestore).toHaveBeenCalledWith(
      'track-1',
      expect.objectContaining({
        frequencyBinCount: 2,
        timeResolution: 0.025,
        sampleRate: 44100,
        duration: 0.05,
      }),
      COLOR,
    );
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it('runs analysis and saves to IndexedDB when no cached data exists', async () => {
    mockGetEntry
      .mockReturnValueOnce(undefined) // initial check
      .mockReturnValue(MOCK_ENTRY); // after analyse

    mockAnalyse.mockResolvedValue(undefined);

    const buffer = mockAudioBuffer();
    const { result } = renderHook(() =>
      useSpectrogramCache('track-1', buffer, COLOR),
    );

    await waitFor(() => {
      expect(result.current).toBe(MOCK_ENTRY);
    });

    expect(mockAnalyse).toHaveBeenCalledWith('track-1', buffer, COLOR);

    // Verify spectrogram data was saved to IndexedDB
    const stored = await loadSpectrogramData('track-1');
    expect(stored).not.toBeNull();
    expect(stored!.trackId).toBe('track-1');
    expect(stored!.timeResolution).toBe(0.025);
  });
});
