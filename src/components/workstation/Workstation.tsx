import { useCallback, useRef, useState } from 'react';
import { useRecordingService } from '../../hooks/useRecordingService';
import { useWorkstation } from '../../hooks/useWorkstation';
import { type Track, type TrackColor } from '../../types/track';
import CountIn from './CountIn';
import Dropzone from '../dropzone/Dropzone';
import { useFileDropzone } from '../dropzone/useFileDropzone';
import EmptyTimeline from './EmptyTimeline';
import MixerBottomSheet from './MixerBottomSheet';
import Scrubber from './scrubber/Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import './Workstation.css';
import {
  useClassificationMessages,
  useCountIn,
  useMicrophone,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from './workstationEffects';

type WorkstationProps = {
  recordingColor: TrackColor;
  tracks: Track[];
  uploadFile: (file: File) => void;
};

const Workstation = (props: WorkstationProps) => {
  const recording = useRecordingService();
  const { pixelsPerSecond } = useWorkstation();
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const { recordingColor, tracks, uploadFile } = props;
  const hasTracks = tracks.length > 0;

  const { isDragActive, isDragAccept, isDragReject, rootProps, inputProps } =
    useFileDropzone(uploadFile);

  useSpacebarPlaybackToggle();
  useClassificationMessages(tracks);
  useTotalTime(tracks);

  const handleCountInComplete = useCallback(() => {
    setIsCountingIn(false);
    setIsRecording(true);
  }, []);

  const countInBeat = useCountIn(isCountingIn, handleCountInComplete);
  useMicrophone(isRecording);

  const toggleMixer = () => setIsMixerOpen((prev) => !prev);
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
  }, []);

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
              drawerHeight={drawerHeight}
              isMixerOpen={isMixerOpen}
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
      <div ref={toolbarRef} className="workstation__toolbar">
        <Toolbar
          isMixerOpen={isMixerOpen}
          isEmpty={!hasTracks}
          onToggleMixer={toggleMixer}
          onToggleRecording={toggleRecording}
        />
      </div>
      <MixerBottomSheet
        isOpen={isMixerOpen}
        onOpenChange={setIsMixerOpen}
        onHeightChange={handleDrawerHeightChange}
        tracks={tracks}
      />
      {countInBeat !== null && <CountIn beat={countInBeat} />}
    </div>
  );
};

export default Workstation;
