import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useAudioBridge } from '../../hooks/useAudioBridge';
import { useTransportBridge } from '../../hooks/useTransportBridge';
import Dropzone from '../dropzone/Dropzone';
import { Track } from '../project/projectPageReducer';
import EmptyTimeline from './EmptyTimeline';
import Mixer from './Mixer';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import { WorkstationDispatch } from './useWorkstationDispatch';
import useWorkstationReducer from './useWorkstationReducer';
import './Workstation.css';
import {
  useDropzoneDragActive,
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
  const [state, dispatch] = useWorkstationReducer();

  const { tracks, uploadFile } = props;
  const hasTracks = tracks.length > 0;

  const { isMixerOpen, isRecording, pixelsPerSecond } = state;

  const { mixerContainerRef, mixerHeight } = useMixerHeight();
  const {
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  } = useDropzoneDragActive();

  const trackIds = useMemo(() => tracks.map((t) => t.trackId), [tracks]);
  useAudioBridge(trackIds);
  useTransportBridge();
  useSpacebarPlaybackToggle();
  useTotalTime(tracks);
  useMicrophone(isRecording);

  const editorMixerClass = classNames('editor__mixer', {
    'editor__mixer--closed': !isMixerOpen,
  });

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isDragActive,
  });

  const memoizedTimeline = useMemo(
    () => <Timeline pixelsPerSecond={pixelsPerSecond} tracks={tracks} />,
    [pixelsPerSecond, tracks],
  );

  const memoizedScrubberTimeline = useMemo(
    () => (
      <Scrubber
        drawerHeight={mixerHeight}
        isMixerOpen={isMixerOpen}
        pixelsPerSecond={pixelsPerSecond}
      >
        {memoizedTimeline}
      </Scrubber>
    ),
    [mixerHeight, isMixerOpen, memoizedTimeline, pixelsPerSecond],
  );

  return (
    <WorkstationDispatch.Provider value={dispatch}>
      <div className="workstation">
        <div className="editor" {...dropzoneRootProps}>
          <div className="editor__timeline">
            {hasTracks ? (
              memoizedScrubberTimeline
            ) : (
              <MemoizedEmptyTimeline isDragActive={isDragActive} />
            )}
          </div>
          <div ref={mixerContainerRef} className={editorMixerClass}>
            <MemoizedMixer tracks={tracks} />
          </div>
          <div className={editorDropzoneClass}>
            <MemoizedDropzone
              setIsDragActive={setIsDragActive}
              setRootProps={setDropzoneRootProps}
              uploadFile={uploadFile}
            />
          </div>
        </div>
        <div className="workstation__toolbar">
          <MemoizedToolbar
            isMixerOpen={isMixerOpen}
            isEmpty={!hasTracks}
            isRecording={isRecording}
          />
        </div>
      </div>
    </WorkstationDispatch.Provider>
  );
};

const MemoizedDropzone = React.memo(Dropzone);
const MemoizedEmptyTimeline = React.memo(EmptyTimeline);
const MemoizedMixer = React.memo(Mixer);
const MemoizedToolbar = React.memo(Toolbar);

export default Workstation;
