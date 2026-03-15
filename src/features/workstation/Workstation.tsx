import { useCallback, useRef, useState } from 'react';
import { usePlaybackService } from '../playback/usePlaybackService';
import { useRecordingService } from '../recording/useRecordingService';
import { useWorkstation } from './useWorkstation';
import { type Track, type TrackColor } from '../tracks/types';
import CountIn from './CountIn';
import Dropzone from '../../shared/dropzone/Dropzone';
import { useFileDropzone } from '../../shared/dropzone/useFileDropzone';
import EmptyTimeline from './EmptyTimeline';
import MixerBottomSheet from './MixerBottomSheet';
import LyricsBottomSheet from './LyricsBottomSheet';
import Scrubber, { type ScrubberHandle } from './scrubber/Scrubber';
import Timeline from './Timeline';
import ToolbarBottomSheet from './ToolbarBottomSheet';
import './Workstation.css';
import {
  useClassificationSync,
  useCountIn,
  useMicrophone,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from './workstationEffects';

type ActiveSheet = 'mixer' | 'lyrics' | null;

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
  const toggleRecording = () => {
    if (isCountingIn) {
      setIsCountingIn(false);
    } else if (isRecording) {
      setIsRecording(false);
    } else {
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
        isEmpty={!hasTracks}
        onToggleMixer={toggleMixer}
        onToggleLyrics={toggleLyrics}
        uploadFile={uploadFile}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        isLogOverlayOpen={isLogOverlayOpen}
        toggleLogOverlay={toggleLogOverlay}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onToggleRecording={toggleRecording}
        sheetOffset={bottomSheetHeight}
      />
      <MixerBottomSheet
        isOpen={isMixerOpen}
        onOpenChange={handleMixerOpenChange}
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
