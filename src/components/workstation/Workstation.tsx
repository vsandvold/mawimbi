import { useSignals } from '@preact/signals-react/runtime';
import classNames from 'classnames';
import { useCallback, useState } from 'react';
import { useAudioBridge } from '../../hooks/useAudioBridge';
import { useTransportBridge } from '../../hooks/useTransportBridge';
import {
  arm,
  isCountingIn as isCountingInSignal,
  recordingState,
} from '../../services/RecordingMachine';
import { pixelsPerSecond as pixelsPerSecondSignal } from '../../signals/workstationSignals';
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
  useSignals();
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);

  const { recordingColor, tracks, uploadFile } = props;
  const hasTracks = tracks.length > 0;

  const pixelsPerSecond = pixelsPerSecondSignal.value;

  const { mixerContainerRef, mixerHeight } = useMixerHeight();
  const { isDragActive, isDragAccept, isDragReject, rootProps, inputProps } =
    useFileDropzone(uploadFile);

  const trackIds = tracks.map((t) => t.trackId);
  useAudioBridge(trackIds);
  useTransportBridge();
  useSpacebarPlaybackToggle();
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
      // Arm the recording machine, then start count-in
      arm();
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
  const isRecordingActive = recordingState.value !== 'idle';
  const showTimeline =
    hasTracks ||
    isRecording ||
    isCountingIn ||
    isRecordingActive ||
    isCountingInSignal.value;

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
