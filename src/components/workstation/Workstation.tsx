import classNames from 'classnames';
import { useState } from 'react';
import { useAudioBridge } from '../../hooks/useAudioBridge';
import { useTransportBridge } from '../../hooks/useTransportBridge';
import { pixelsPerSecond as pixelsPerSecondSignal } from '../../signals/workstationSignals';
import Dropzone from '../dropzone/Dropzone';
import { useFileDropzone } from '../dropzone/useFileDropzone';
import { Track } from '../project/projectPageReducer';
import EmptyTimeline from './EmptyTimeline';
import Mixer from './Mixer';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import './Workstation.css';
import {
  useMicrophone,
  useMixerHeight,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from './workstationEffects';

type WorkstationProps = {
  tracks: Track[];
  uploadFile: (file: File) => void;
};

const Workstation = (props: WorkstationProps) => {
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const { tracks, uploadFile } = props;
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
  useMicrophone(isRecording);

  const toggleMixer = () => setIsMixerOpen((prev) => !prev);
  const toggleRecording = () => setIsRecording((prev) => !prev);

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
          {hasTracks ? (
            <Scrubber
              drawerHeight={mixerHeight}
              isMixerOpen={isMixerOpen}
              pixelsPerSecond={pixelsPerSecond}
            >
              <Timeline pixelsPerSecond={pixelsPerSecond} tracks={tracks} />
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
          isRecording={isRecording}
          onToggleMixer={toggleMixer}
          onToggleRecording={toggleRecording}
        />
      </div>
    </div>
  );
};

export default Workstation;
