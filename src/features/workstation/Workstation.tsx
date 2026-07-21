import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaybackService } from '../playback/usePlaybackService';
import { useRecordingService } from '../recording/useRecordingService';
import { useTrackService } from '../tracks/useTrackService';
import { useWorkstation } from './useWorkstation';
import { type Track, type TrackColor } from '../tracks/types';
import CountIn from './CountIn';
import Dropzone from '../../shared/dropzone/Dropzone';
import { useFileDropzone } from '../../shared/dropzone/useFileDropzone';
import EmptyTimeline from './EmptyTimeline';
import EffectsBottomSheet from './EffectsBottomSheet';
import MixerBottomSheet from './MixerBottomSheet';
import LyricsBottomSheet from './LyricsBottomSheet';
import RecordingBottomSheet from './RecordingBottomSheet';
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
  useToggleMonitoring,
  useTotalTime,
} from './workstationEffects';

type ActiveSheet = 'mixer' | 'lyrics' | 'effects' | 'recording' | null;

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
  const trackService = useTrackService();
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
  const isRecordingOpen = activeSheet === 'recording';

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
  const handleToggleMonitoring = useToggleMonitoring();

  const toggleLyrics = () =>
    setActiveSheet((prev) => (prev === 'lyrics' ? null : 'lyrics'));
  const toggleMixer = () =>
    setActiveSheet((prev) => (prev === 'mixer' ? null : 'mixer'));
  const toggleEffects = () =>
    setActiveSheet((prev) => (prev === 'effects' ? null : 'effects'));
  // The toolbar mic button only opens/closes the recording drawer (spec 005
  // Decision 5) — arming lives inside the drawer's own control
  // (handleToggleRecord below). Disabled by FloatingToolbar while the
  // transport is locked, so this never fires mid-recording.
  const toggleRecordingSheet = () =>
    setActiveSheet((prev) => (prev === 'recording' ? null : 'recording'));

  const handleToggleRecord = () => {
    if (isCountingIn) {
      setIsCountingIn(false);
    } else if (isRecording) {
      setIsRecording(false);
    } else {
      // activeSheet is a single union value, so the recording drawer and
      // the effects sheet can never both be open — no separate guard
      // needed to close effects before arming (spec 005 Decision 5
      // structuralizes spec 004's "edit mode and armed-recording never
      // overlap" invariant).
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

  const handleRecordingOpenChange = useCallback((open: boolean) => {
    setActiveSheet(open ? 'recording' : null);
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

  // Mirrors edit mode into the audio engine: while a track is being
  // edited, muting/solo are temporarily bypassed and the other tracks are
  // sonically dimmed, so the edited track is always audible over a quieter
  // mix; exiting restores the user's mute/solo state exactly. Keyed on the
  // active track id so enter, cycle, and exit all pass through this one
  // effect (same rationale as the activeSheet effect above). No cleanup
  // here: cycling A→B must not pass through a transient null focus, which
  // would un-dim and re-mute every channel between the two tracks.
  const activeEditTrackId = editMode.activeEditTrackId;
  useEffect(() => {
    trackService.setEditFocus(activeEditTrackId);
    // trackService delegates to a stable service singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditTrackId]);

  // Unmount-only: project navigation must not leak an active edit focus
  // into the next project's audio engine.
  useEffect(() => {
    return () => trackService.setEditFocus(null);
    // trackService delegates to a stable service singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the edited track disappears (undo of an upload/recording — the
  // toolbar's Undo stays keyboard-reachable behind the drawer), re-anchor
  // edit mode to the newest remaining track. A stale id would otherwise
  // dim every channel with muting bypassed and no foreground track, and
  // the cycle buttons vanish with it — no way out but closing the drawer.
  useEffect(() => {
    if (activeEditTrackId === null) return;
    if (tracks.some((track) => track.trackId === activeEditTrackId)) return;
    const newestTrack = tracks[tracks.length - 1];
    if (newestTrack) {
      editMode.enterEditMode(newestTrack.trackId);
    } else {
      editMode.exitEditMode();
    }
    // editMode is a stable object from the bridge hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, activeEditTrackId]);

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
  // Edit mode (spec 004) and the other sheets (spec 005) are unavailable
  // while recording or counting in — every sheet toggle stays inert so the
  // recording drawer is the only reachable one during capture.
  const isRecordingLocked = isRecordingActive || isCountingIn;
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
        isRecordingOpen={isRecordingOpen}
        isRecordingLocked={isRecordingLocked}
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
        onToggleRecording={toggleRecordingSheet}
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
      <RecordingBottomSheet
        isOpen={isRecordingOpen}
        onOpenChange={handleRecordingOpenChange}
        onHeightChange={handleContentSheetHeightChange}
        isCountingIn={isCountingIn}
        isRecording={isRecording}
        onToggleRecord={handleToggleRecord}
        isMonitoring={recording.isMonitoring}
        monitorVolume={recording.monitorVolume}
        onToggleMonitoring={handleToggleMonitoring}
        onMonitorVolumeChange={recording.setMonitorVolume}
      />
      {countInBeat !== null && <CountIn beat={countInBeat} />}
    </div>
  );
};

export default Workstation;
