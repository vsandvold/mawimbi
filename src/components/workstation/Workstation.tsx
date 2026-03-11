import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { usePlaybackService } from '../../hooks/usePlaybackService';
import { useRecordingService } from '../../hooks/useRecordingService';
import { useWorkstation } from '../../hooks/useWorkstation';
import { type Track, type TrackColor } from '../../types/track';
import CountIn from './CountIn';
import Dropzone from '../dropzone/Dropzone';
import { useFileDropzone } from '../dropzone/useFileDropzone';
import EmptyTimeline from './EmptyTimeline';
import MixerBottomSheet from './MixerBottomSheet';
import LyricsBottomSheet from './LyricsBottomSheet';
import Scrubber, { type ScrubberHandle } from './scrubber/Scrubber';
import Timeline from './Timeline';
import FloatingToolbar from './FloatingToolbar';
import Toolbar from './Toolbar';
import './Workstation.css';
import {
  useClassificationSync,
  useCountIn,
  useMicrophone,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from './workstationEffects';

type ActiveSheet = 'mixer' | 'lyrics' | null;

type WorkstationProps = {
  recordingColor: TrackColor;
  tracks: Track[];
  uploadFile: (file: File) => void;
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
  isLogOverlayOpen: boolean;
  toggleLogOverlay: () => void;
};

const Workstation = (props: WorkstationProps) => {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const { pixelsPerSecond } = useWorkstation();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(0);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<ScrubberHandle>(null);

  const {
    recordingColor,
    tracks,
    uploadFile,
    isFullscreen,
    toggleFullscreen,
    isLogOverlayOpen,
    toggleLogOverlay,
  } = props;
  const hasTracks = tracks.length > 0;
  const isMixerOpen = activeSheet === 'mixer';
  const isLyricsOpen = activeSheet === 'lyrics';

  const { isDragActive, isDragAccept, isDragReject, rootProps, inputProps } =
    useFileDropzone(uploadFile);

  useLayoutEffect(() => {
    if (toolbarRef.current) {
      setToolbarHeight(toolbarRef.current.offsetHeight);
    }
  }, []);

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

  const handleDrawerHeightChange = useCallback((height: number) => {
    // The bottom sheet (fixed at viewport bottom) covers the toolbar before
    // overlapping the timeline. Only the overlap with the timeline matters
    // for scaling, so subtract the toolbar height.
    const toolbarHeight = toolbarRef.current?.offsetHeight ?? 0;
    setDrawerHeight(Math.max(0, height - toolbarHeight));
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
      <div ref={toolbarRef} className="workstation__toolbar">
        <Toolbar
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
        />
      </div>
      <FloatingToolbar
        isEmpty={!hasTracks}
        bottomOffset={bottomSheetHeight + toolbarHeight + 12}
        onToggleRecording={toggleRecording}
      />
      <MixerBottomSheet
        isOpen={isMixerOpen}
        onOpenChange={handleMixerOpenChange}
        onHeightChange={handleDrawerHeightChange}
        tracks={tracks}
      />
      <LyricsBottomSheet
        isOpen={isLyricsOpen}
        onOpenChange={handleLyricsOpenChange}
        onHeightChange={handleDrawerHeightChange}
        onSeekTo={handleLyricsSeekTo}
        tracks={tracks}
      />
      {countInBeat !== null && <CountIn beat={countInBeat} />}
    </div>
  );
};

export default Workstation;
