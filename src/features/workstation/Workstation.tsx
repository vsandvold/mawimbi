import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaybackService } from '../playback/usePlaybackService';
import { useRecordingService } from '../recording/useRecordingService';
import { useWorkstation } from './useWorkstation';
import { type Track, type TrackColor } from '../tracks/types';
import CountIn from './CountIn';
import Dropzone from '../../shared/dropzone/Dropzone';
import { useFileDropzone } from '../../shared/dropzone/useFileDropzone';
import EmptyTimeline from './EmptyTimeline';
import EffectsBottomSheet from './EffectsBottomSheet';
import MixerBottomSheet from './MixerBottomSheet';
import LyricsBottomSheet from './LyricsBottomSheet';
import Scrubber, { type ScrubberHandle } from './scrubber/Scrubber';
import Timeline from './Timeline';
import ToolbarBottomSheet from './ToolbarBottomSheet';
import { useEditMode } from './useEditMode';
import './Workstation.css';
import {
  useClassificationSync,
  useCountIn,
  useMicrophone,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from './workstationEffects';

type ActiveSheet = 'mixer' | 'lyrics' | 'effects' | null;

// Toolbar dock default height: compact header (20px) + one row (48px)
const TOOLBAR_DOCK_HEIGHT = 68;

type WorkstationProps = {
  recordingColor: TrackColor;
  tracks: Track[];
  uploadFile: (file: File) => void;
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
  isLogOverlayOpen: boolean;
  toggleLogOverlay: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const Workstation = (props: WorkstationProps) => {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const editMode = useEditMode();
  const { pixelsPerSecond } = useWorkstation();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  // The toolbar dock always overlaps the timeline from the bottom.
  // Start with the dock's default height as the base drawer height.
  const [drawerHeight, setDrawerHeight] = useState(TOOLBAR_DOCK_HEIGHT);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(0);
  const scrubberRef = useRef<ScrubberHandle>(null);

  const {
    recordingColor,
    tracks,
    uploadFile,
    isFullscreen,
    toggleFullscreen,
    isLogOverlayOpen,
    toggleLogOverlay,
    undo,
    redo,
    canUndo,
    canRedo,
  } = props;
  const hasTracks = tracks.length > 0;
  const isMixerOpen = activeSheet === 'mixer';
  const isLyricsOpen = activeSheet === 'lyrics';
  const isEffectsOpen = activeSheet === 'effects';

  const { isDragActive, isDragAccept, isDragReject, rootProps, inputProps } =
    useFileDropzone(uploadFile);

  useSpacebarPlaybackToggle();
  useClassificationSync(tracks);
  useTotalTime(tracks);

  const handleCountInComplete = useCallback(() => {
    setIsCountingIn(false);
    setIsRecording(true);
  }, []);

  const countInBeat = useCountIn(isCountingIn, handleCountInComplete);
  useMicrophone(isRecording);

  const toggleLyrics = () =>
    setActiveSheet((prev) => (prev === 'lyrics' ? null : 'lyrics'));
  const toggleMixer = () =>
    setActiveSheet((prev) => (prev === 'mixer' ? null : 'mixer'));
  const toggleEffects = () =>
    setActiveSheet((prev) => (prev === 'effects' ? null : 'effects'));
  const toggleRecording = () => {
    if (isCountingIn) {
      setIsCountingIn(false);
    } else if (isRecording) {
      setIsRecording(false);
    } else {
      // The edit mode and armed-recording states never overlap (spec 004) —
      // close the drawer before arming.
      if (isEffectsOpen) {
        setActiveSheet(null);
      }
      // Arm the recording service, then start count-in
      recording.arm();
      setIsCountingIn(true);
    }
  };

  const handleStopRecording = () => {
    if (isRecording) {
      setIsRecording(false);
    } else if (isCountingIn) {
      setIsCountingIn(false);
    }
  };

  const handleContentSheetHeightChange = useCallback((height: number) => {
    // The content sheet (mixer/lyrics) stacks above the toolbar dock.
    // Total overlap = dock height + content sheet height.
    setDrawerHeight(TOOLBAR_DOCK_HEIGHT + height);
    setBottomSheetHeight(height);
  }, []);

  const handleMixerOpenChange = useCallback((open: boolean) => {
    setActiveSheet(open ? 'mixer' : null);
  }, []);

  const handleLyricsOpenChange = useCallback((open: boolean) => {
    setActiveSheet(open ? 'lyrics' : null);
  }, []);

  const handleEffectsOpenChange = useCallback((open: boolean) => {
    setActiveSheet(open ? 'effects' : null);
  }, []);

  // Centralizes edit-mode enter/exit so every path that leaves the effects
  // sheet — the drawer's own close button, switching to mixer/lyrics, the
  // toolbar toggle, arming a recording, or unmounting entirely (project
  // navigation) — reliably exits edit mode. A prior version called
  // enterEditMode/exitEditMode only from handleEffectsOpenChange, which
  // left activeEditTrackId stale (and Timeline permanently dimmed with no
  // drawer open) whenever activeSheet changed some other way.
  useEffect(() => {
    if (activeSheet === 'effects') {
      // Newest track = mixer's top row (product rule #20). Captured once
      // on entry, not re-synced while the drawer stays open.
      const newestTrack = tracks[tracks.length - 1];
      if (newestTrack) {
        editMode.enterEditMode(newestTrack.trackId);
      }
    }
    return () => editMode.exitEditMode();
    // Reacts only to entering/leaving the effects sheet, not to every
    // track-list mutation; editMode is a stable object from the bridge hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheet]);

  const handleRewind = useCallback(() => {
    playback.rewind();
    scrubberRef.current?.syncScrollToTime(0);
    // playback is a stable ref from context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLyricsSeekTo = useCallback(
    (time: number) => {
      playback.seekTo(time);
      scrubberRef.current?.syncScrollToTime(time);
    },
    // playback is a stable ref from context
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Show the timeline when tracks exist or when recording is active.
  // Use the recording state machine signal (not local state) so the
  // timeline stays visible during the async stop-recording transition
  // until the new track is added.
  const isRecordingActive = recording.recordingState !== 'idle';
  // Edit mode is unavailable while recording or counting in (spec 004) —
  // the two modal states never overlap.
  const isEffectsDisabled = isRecordingActive || isCountingIn;
  const showTimeline =
    hasTracks ||
    isRecording ||
    isCountingIn ||
    isRecordingActive ||
    recording.isCountingIn;

  const editorDropzoneClass = isDragActive
    ? 'editor__dropzone'
    : 'editor__dropzone editor__dropzone--hidden';

  return (
    <div className="workstation">
      <div className="editor" {...rootProps}>
        <div className="editor__timeline">
          {showTimeline ? (
            <Scrubber
              ref={scrubberRef}
              drawerHeight={drawerHeight}
              onStopRecording={handleStopRecording}
              pixelsPerSecond={pixelsPerSecond}
              tracks={tracks}
            >
              <Timeline
                pixelsPerSecond={pixelsPerSecond}
                recordingColor={recordingColor}
                tracks={tracks}
              />
            </Scrubber>
          ) : (
            <EmptyTimeline isDragActive={isDragActive} />
          )}
        </div>
        <div className={editorDropzoneClass}>
          <Dropzone
            isDragActive={isDragActive}
            isDragAccept={isDragAccept}
            isDragReject={isDragReject}
            inputProps={inputProps}
          />
        </div>
      </div>
      <ToolbarBottomSheet
        isMixerOpen={isMixerOpen}
        isLyricsOpen={isLyricsOpen}
        isEffectsOpen={isEffectsOpen}
        isEffectsDisabled={isEffectsDisabled}
        isEmpty={!hasTracks}
        onToggleMixer={toggleMixer}
        onToggleLyrics={toggleLyrics}
        onToggleEffects={toggleEffects}
        uploadFile={uploadFile}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        isLogOverlayOpen={isLogOverlayOpen}
        toggleLogOverlay={toggleLogOverlay}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onRewind={handleRewind}
        onToggleRecording={toggleRecording}
        sheetOffset={bottomSheetHeight}
      />
      <MixerBottomSheet
        isOpen={isMixerOpen}
        onOpenChange={handleMixerOpenChange}
        onHeightChange={handleContentSheetHeightChange}
        tracks={tracks}
      />
      <EffectsBottomSheet
        isOpen={isEffectsOpen}
        onOpenChange={handleEffectsOpenChange}
        onHeightChange={handleContentSheetHeightChange}
        tracks={tracks}
      />
      <LyricsBottomSheet
        isOpen={isLyricsOpen}
        onOpenChange={handleLyricsOpenChange}
        onHeightChange={handleContentSheetHeightChange}
        onSeekTo={handleLyricsSeekTo}
        tracks={tracks}
      />
      {countInBeat !== null && <CountIn beat={countInBeat} />}
    </div>
  );
};

export default Workstation;
