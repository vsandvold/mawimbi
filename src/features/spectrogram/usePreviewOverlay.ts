// Bridge hook (spec 006 M6, mawimbi#543): owns this track's PreviewScheduler
// and exposes the current provisional overlay to `Spectrogram.tsx`'s render
// loop, plus a `reportVisibleWindow` callback the same component's write
// phase calls every frame so a drag tick always previews the window
// actually on screen (not a stale one).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioService } from '../audio/useAudioService';
import { renderTrackOfflineWindow } from '../tracks/renderTrackOffline';
import { type TrackColor, type TrackId } from '../tracks/types';
import {
  PreviewScheduler,
  type PreviewOverlay,
  type PreviewWindowRequest,
} from '../workstation/effectsPreview';
import {
  markPreviewOverlayActive,
  registerPreviewRequester,
} from './previewOverlayRegistry';
import { type TrackSpectrogramEntry } from './SpectrogramCache';

export function usePreviewOverlay(
  trackId: TrackId,
  audioBuffer: AudioBuffer | undefined,
  color: TrackColor,
  entry: TrackSpectrogramEntry | undefined,
) {
  const audioService = useAudioService();
  const [previewOverlay, setPreviewOverlay] = useState<
    PreviewOverlay | undefined
  >();
  const schedulerRef = useRef<PreviewScheduler | null>(null);
  const visibleWindowRef = useRef<PreviewWindowRequest | null>(null);

  useEffect(() => {
    if (!audioBuffer) return;

    const scheduler = new PreviewScheduler({
      renderOfflineWindow: renderTrackOfflineWindow,
      analyseToResult: (buffer, col) =>
        audioService.spectrogramCache.analyseToResult(buffer, col),
      setPreview: (id, overlay) => {
        setPreviewOverlay(overlay);
        markPreviewOverlayActive(id, true);
      },
      clearPreview: (id) => {
        setPreviewOverlay(undefined);
        markPreviewOverlayActive(id, false);
      },
    });
    schedulerRef.current = scheduler;

    const unregister = registerPreviewRequester(trackId, (amounts) => {
      const request = visibleWindowRef.current;
      if (!request) return;
      scheduler.schedule(trackId, audioBuffer, color, amounts, request);
    });

    return () => {
      unregister();
      scheduler.dispose();
      schedulerRef.current = null;
    };
    // color is a stable per-track identity object; audioService is a
    // stable singleton accessed via context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, audioBuffer]);

  // The commit refresh landing (its result stamps a new effectsParamsHash
  // on `entry`) supersedes any provisional preview for this track — clear
  // it so the committed tiles show through immediately instead of waiting
  // for the next drag tick. Also covers a drag abandoned without a normal
  // release: the dirty-flag safety net in useEffectControls.ts always
  // commits on unmount/track-switch, which lands here the same way.
  useEffect(() => {
    schedulerRef.current?.clear(trackId);
    // trackId is stable for the lifetime of this hook instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.effectsParamsHash]);

  const reportVisibleWindow = useCallback(
    (request: PreviewWindowRequest | null) => {
      visibleWindowRef.current = request;
    },
    [],
  );

  return { previewOverlay, reportVisibleWindow };
}
