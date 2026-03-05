import classNames from 'classnames';
import { useCallback, useState } from 'react';
import { useRecordingService } from '../../hooks/useRecordingService';
import { useWorkstation } from '../../hooks/useWorkstation';
import { type Track, type TrackColor } from '../../types/track';
import CountIn from './CountIn';
import Dropzone from '../dropzone/Dropzone';
import { useFileDropzone } from '../dropzone/useFileDropzone';
import EmptyTimeline from './EmptyTimeline';
import Mixer from './Mixer';
import Scrubber from './scrubber/Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import './Workstation.css';
import {
  useClassificationErrors,
  useCountIn,
  useMicrophone,
  useMixerHeight,
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

  const { recordingColor, tracks, uploadFile } = props;
  const hasTracks = tracks.length > 0;

  const { mixerContainerRef, mixerHeight } = useMixerHeight();
  const { isDragActive, isDragAccept, isDragReject, rootProps, inputProps } =
    useFileDropzone(uploadFile);

  useSpacebarPlaybackToggle();
  useClassificationErrors(tracks);
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

  const editorMixerClass = classNames('editor__mixer', {
    'editor__mixer--closed': !isMixerOpen,
  });

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isDragActive,
  });

  return (
    <div className="workstation">
      <div className="editor" {...rootProps}>
        <div className="editor__timeline">
          {showTimeline ? (
            <Scrubber
              drawerHeight={mixerHeight}
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
        <div ref={mixerContainerRef} className={editorMixerClass}>
          <Mixer tracks={tracks} />
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
      <div className="workstation__toolbar">
        <Toolbar
          isMixerOpen={isMixerOpen}
          isEmpty={!hasTracks}
          onToggleMixer={toggleMixer}
          onToggleRecording={toggleRecording}
        />
      </div>
      {countInBeat !== null && <CountIn beat={countInBeat} />}
    </div>
  );
};

export default Workstation;
