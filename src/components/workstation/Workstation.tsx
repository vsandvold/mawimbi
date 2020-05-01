import classNames from 'classnames';
import React, { useMemo } from 'react';
import Dropzone from '../dropzone/Dropzone';
import { Track } from '../project/projectReducer';
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
  useMixerDrawerHeight,
  useMutedTracks,
  usePlaybackToggle,
  useSpacebarPlaybackToggle,
  useTransportTime,
} from './workstationEffects';

type WorkstationProps = {
  tracks: Track[];
  uploadFile: (file: File) => void;
};

const Workstation = (props: WorkstationProps) => {
  const [state, dispatch] = useWorkstationReducer();

  const { tracks, uploadFile } = props;
  const hasTracks = tracks.length > 0;

  const {
    focusedTracks,
    isDrawerOpen,
    isPlaying,
    mutedTracks,
    pixelsPerSecond,
    transportTime,
  } = state;

  const { drawerContainerRef, drawerHeight } = useMixerDrawerHeight();
  const {
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  } = useDropzoneDragActive();

  useMutedTracks(tracks, dispatch);
  usePlaybackToggle(isPlaying);
  useSpacebarPlaybackToggle(dispatch);
  useTransportTime(transportTime);

  const editorDrawerClass = classNames('editor__drawer', {
    'editor__drawer--closed': !isDrawerOpen,
  });

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isDragActive,
  });

  const memoizedTimeline = useMemo(
    () => (
      <Timeline
        focusedTracks={focusedTracks}
        mutedTracks={mutedTracks}
        pixelsPerSecond={pixelsPerSecond}
        tracks={tracks}
      />
    ),
    [focusedTracks, mutedTracks, pixelsPerSecond, tracks]
  );

  const memoizedScrubberTimeline = useMemo(
    () => (
      <Scrubber
        drawerHeight={drawerHeight}
        isDrawerOpen={isDrawerOpen}
        isPlaying={isPlaying}
        pixelsPerSecond={pixelsPerSecond}
        transportTime={transportTime}
      >
        {memoizedTimeline}
      </Scrubber>
    ),
    [
      drawerHeight,
      isDrawerOpen,
      isPlaying,
      memoizedTimeline,
      pixelsPerSecond,
      transportTime,
    ]
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
          <div ref={drawerContainerRef} className={editorDrawerClass}>
            <MemoizedMixer mutedTracks={mutedTracks} tracks={tracks} />
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
            isDrawerOpen={isDrawerOpen}
            isEmpty={!hasTracks}
            isPlaying={isPlaying}
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
