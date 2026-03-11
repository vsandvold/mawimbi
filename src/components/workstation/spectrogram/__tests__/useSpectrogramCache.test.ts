import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MelodyData } from '../../../../services/MelodyExtractor';
import type { SpectrogramData } from '../../../../services/OfflineAnalyser';
import {
  loadMelodyData,
  loadSpectrogramData,
  resetDB,
  saveMelodyData,
  saveSpectrogramData,
  type MelodyStoreData,
  type SpectrogramStoreData,
} from '../../../../services/ProjectStorageService';
import type { TrackSpectrogramEntry } from '../../../../services/SpectrogramCache';
import { type TrackColor } from '../../../../types/track';
import {
  fromMelodyStoreData,
  fromSpectrogramStoreData,
  toMelodyStoreData,
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

const MOCK_MELODY: MelodyData = {
  notes: [{ startTime: 0.1, endTime: 0.5, midiNote: 60, confidence: 0.9 }],
  timeResolution: 0.0029,
};

const MOCK_ENTRY: TrackSpectrogramEntry = {
  data: MOCK_DATA,
  tiles: [],
};

const MOCK_ENTRY_WITH_MELODY: TrackSpectrogramEntry = {
  data: MOCK_DATA,
  tiles: [],
  melody: MOCK_MELODY,
};

const mockGetEntry = vi.fn();
const mockAnalyse = vi.fn();
const mockRestore = vi.fn();
const mockGetMelody = vi.fn();
const mockSetMelody = vi.fn();
const mockExtractMelodyInWorker = vi.fn();

vi.mock('../../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    spectrogramCache: {
      getEntry: mockGetEntry,
      analyse: mockAnalyse,
      restore: mockRestore,
      getMelody: mockGetMelody,
      setMelody: mockSetMelody,
      extractMelodyInWorker: mockExtractMelodyInWorker,
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

describe('toMelodyStoreData', () => {
  it('converts MelodyData to MelodyStoreData', () => {
    const result = toMelodyStoreData('track-1', MOCK_MELODY);

    expect(result.trackId).toBe('track-1');
    expect(result.notes).toEqual(MOCK_MELODY.notes);
    expect(result.timeResolution).toBe(0.0029);
  });
});

describe('fromMelodyStoreData', () => {
  it('converts MelodyStoreData back to MelodyData', () => {
    const stored: MelodyStoreData = {
      trackId: 'track-1',
      notes: [{ startTime: 0.1, endTime: 0.5, midiNote: 60, confidence: 0.9 }],
      timeResolution: 0.0029,
    };

    const result = fromMelodyStoreData(stored);

    expect(result.notes).toEqual(stored.notes);
    expect(result.timeResolution).toBe(0.0029);
  });

  it('round-trips through to/from without data loss', () => {
    const stored = toMelodyStoreData('track-1', MOCK_MELODY);
    const restored = fromMelodyStoreData(stored);

    expect(restored.notes).toEqual(MOCK_MELODY.notes);
    expect(restored.timeResolution).toBe(MOCK_MELODY.timeResolution);
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

    // Melody is missing from IndexedDB — extraction will be triggered
    mockExtractMelodyInWorker.mockResolvedValue(MOCK_MELODY);

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
    mockExtractMelodyInWorker.mockResolvedValue(MOCK_MELODY);

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

  it('restores melody from IndexedDB alongside spectrogram', async () => {
    mockGetEntry
      .mockReturnValueOnce(undefined)
      .mockReturnValue(MOCK_ENTRY_WITH_MELODY);

    const storeData = toSpectrogramStoreData('track-1', MOCK_DATA);
    await saveSpectrogramData(storeData);
    const melodyStore = toMelodyStoreData('track-1', MOCK_MELODY);
    await saveMelodyData(melodyStore);

    const { result } = renderHook(() =>
      useSpectrogramCache('track-1', mockAudioBuffer(), COLOR),
    );

    await waitFor(() => {
      expect(result.current).toBe(MOCK_ENTRY_WITH_MELODY);
    });

    expect(mockSetMelody).toHaveBeenCalledWith(
      'track-1',
      expect.objectContaining({
        timeResolution: 0.0029,
        notes: expect.arrayContaining([
          expect.objectContaining({ midiNote: 60 }),
        ]),
      }),
    );
  });

  it('runs melody extraction after spectrogram analysis', async () => {
    mockGetEntry.mockReturnValueOnce(undefined).mockReturnValue(MOCK_ENTRY);

    mockAnalyse.mockResolvedValue(undefined);
    mockExtractMelodyInWorker.mockResolvedValue(MOCK_MELODY);

    const buffer = mockAudioBuffer();
    renderHook(() => useSpectrogramCache('track-1', buffer, COLOR));

    await waitFor(() => {
      expect(mockExtractMelodyInWorker).toHaveBeenCalledWith(buffer);
    });

    await waitFor(() => {
      expect(mockSetMelody).toHaveBeenCalledWith('track-1', MOCK_MELODY);
    });

    // Verify melody data was saved to IndexedDB
    const stored = await loadMelodyData('track-1');
    expect(stored).not.toBeNull();
    expect(stored!.trackId).toBe('track-1');
    expect(stored!.timeResolution).toBe(0.0029);
  });

  it('runs melody extraction when spectrogram is in IndexedDB but melody is not', async () => {
    mockGetEntry
      .mockReturnValueOnce(undefined) // initial check: not in memory
      .mockReturnValue(MOCK_ENTRY); // after restore

    // Only spectrogram is in IndexedDB — no melody data
    const storeData = toSpectrogramStoreData('track-1', MOCK_DATA);
    await saveSpectrogramData(storeData);

    mockExtractMelodyInWorker.mockResolvedValue(MOCK_MELODY);

    const buffer = mockAudioBuffer();
    renderHook(() => useSpectrogramCache('track-1', buffer, COLOR));

    // Should still trigger melody extraction even though spectrogram was cached
    await waitFor(() => {
      expect(mockExtractMelodyInWorker).toHaveBeenCalledWith(buffer);
    });

    await waitFor(() => {
      expect(mockSetMelody).toHaveBeenCalledWith('track-1', MOCK_MELODY);
    });

    // Verify melody data was saved to IndexedDB
    const stored = await loadMelodyData('track-1');
    expect(stored).not.toBeNull();
    expect(stored!.trackId).toBe('track-1');
  });

  it('does not fail when melody extraction errors', async () => {
    mockGetEntry.mockReturnValueOnce(undefined).mockReturnValue(MOCK_ENTRY);

    mockAnalyse.mockResolvedValue(undefined);
    mockExtractMelodyInWorker.mockRejectedValue(
      new Error('essentia.js unavailable'),
    );

    const buffer = mockAudioBuffer();
    const { result } = renderHook(() =>
      useSpectrogramCache('track-1', buffer, COLOR),
    );

    await waitFor(() => {
      expect(result.current).toBe(MOCK_ENTRY);
    });

    // Melody extraction failed but spectrogram still works
    expect(mockSetMelody).not.toHaveBeenCalled();
  });
});
