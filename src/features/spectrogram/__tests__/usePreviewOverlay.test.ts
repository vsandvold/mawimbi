import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { type TrackColor } from '../../tracks/types';
import { usePreviewOverlay } from '../usePreviewOverlay';
import { requestTrackPreview } from '../previewOverlayRegistry';

const COLOR: TrackColor = { r: 1, g: 2, b: 3 };
const TRACK_ID = 'track-1';
const AMOUNTS = { space: 50, echo: 0, tone: 0 };

const mockAnalyseToResult = vi.fn();
const mockSpectrogramCache = { analyseToResult: mockAnalyseToResult };
const mockAudioServiceValue = { spectrogramCache: mockSpectrogramCache };

vi.mock('../../audio/useAudioService', () => ({
  useAudioService: () => mockAudioServiceValue,
}));

const mockRenderTrackOfflineWindow = vi.fn();
vi.mock('../../tracks/renderTrackOffline', () => ({
  renderTrackOfflineWindow: (...args: unknown[]) =>
    mockRenderTrackOfflineWindow(...args),
}));

function mockAudioBuffer(): AudioBuffer {
  return { duration: 20 } as unknown as AudioBuffer;
}

// A `close` spy per bitmap — regression coverage for a code-review finding
// (mawimbi#551): the preview overlay's `ImageBitmap` was never closed when
// replaced or cleared, leaking one bitmap per throttle tick during a drag.
function mockTile(): ImageBitmap {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

beforeEach(() => {
  mockAnalyseToResult.mockReset();
  mockRenderTrackOfflineWindow.mockReset().mockResolvedValue(mockAudioBuffer());
});

describe('usePreviewOverlay tile lifecycle', () => {
  it('closes the previous overlay tile when a new preview replaces it', async () => {
    const tileA = mockTile();
    const tileB = mockTile();
    mockAnalyseToResult
      .mockResolvedValueOnce({ data: {}, tiles: [tileA] })
      .mockResolvedValueOnce({ data: {}, tiles: [tileB] });

    // A stable reference across re-renders — matching the real app, where
    // `Spectrogram.tsx` gets `audioBuffer` from `trackHook.retrieveAudioBuffer`
    // (stable for a given track), not a fresh object every render. A fresh
    // object here would make the hook's `[trackId, audioBuffer]` effect
    // re-run (and dispose/recreate its scheduler) on every state update.
    const audioBuffer = mockAudioBuffer();
    const { result } = renderHook(() =>
      usePreviewOverlay(TRACK_ID, audioBuffer, COLOR, undefined),
    );

    act(() => {
      result.current.reportVisibleWindow({ startSeconds: 0, endSeconds: 8 });
    });
    act(() => {
      requestTrackPreview(TRACK_ID, AMOUNTS);
    });

    await waitFor(() =>
      expect(result.current.previewOverlay?.tile).toBe(tileA),
    );
    expect(tileA.close).not.toHaveBeenCalled();

    act(() => {
      requestTrackPreview(TRACK_ID, { ...AMOUNTS, space: 90 });
    });

    await waitFor(() =>
      expect(result.current.previewOverlay?.tile).toBe(tileB),
    );
    expect(tileA.close).toHaveBeenCalledTimes(1);
    expect(tileB.close).not.toHaveBeenCalled();
  });

  it('closes the current overlay tile on unmount', async () => {
    const tile = mockTile();
    mockAnalyseToResult.mockResolvedValueOnce({ data: {}, tiles: [tile] });

    const audioBuffer = mockAudioBuffer();
    const { result, unmount } = renderHook(() =>
      usePreviewOverlay(TRACK_ID, audioBuffer, COLOR, undefined),
    );

    act(() => {
      result.current.reportVisibleWindow({ startSeconds: 0, endSeconds: 8 });
    });
    act(() => {
      requestTrackPreview(TRACK_ID, AMOUNTS);
    });

    await waitFor(() => expect(result.current.previewOverlay?.tile).toBe(tile));

    unmount();

    expect(tile.close).toHaveBeenCalledTimes(1);
  });
});
