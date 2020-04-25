import classNames from 'classnames';
import React, { useMemo } from 'react';
import Dropzone from '../dropzone/Dropzone';
import { Track } from '../project/useProjectState';
import EmptyTimeline from './EmptyTimeline';
import Mixer from './Mixer';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import { WorkstationDispatch } from './useWorkstationDispatchContext';
import useWorkstationEffect from './useWorkstationEffects';
import useWorkstationReducer from './useWorkstationReducer';
import './Workstation.css';

type WorkstationProps = {
  tracks: Track[];
  uploadFile: (file: File) => void;
};

const Workstation = (props: WorkstationProps) => {
  console.log('Workstation render');

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

  const {
    timelineScaleFactor,
    timelineContainerRef,
    drawerContainerRef,
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  } = useWorkstationEffect(props, state, dispatch);

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
        isPlaying={isPlaying}
        pixelsPerSecond={pixelsPerSecond}
        transportTime={transportTime}
      >
        {memoizedTimeline}
      </Scrubber>
    ),
    [isPlaying, memoizedTimeline, pixelsPerSecond, transportTime]
  );

  return (
    <WorkstationDispatch.Provider value={dispatch}>
      <div className="workstation">
        <div className="editor" {...dropzoneRootProps}>
          <div
            ref={timelineContainerRef}
            className="editor__timeline"
            style={getTimelineStyle(isDrawerOpen, timelineScaleFactor)}
          >
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

function getTimelineStyle(isDrawerOpen: boolean, timelineScaleFactor: number) {
  const defaultStyle = {
    transformOrigin: 'top left',
    transition: 'transform 0.3s',
    willChange: 'transform',
  };
  return isDrawerOpen
    ? { ...defaultStyle, transform: `scaleY(${timelineScaleFactor})` }
    : defaultStyle;
}

const MemoizedDropzone = React.memo(Dropzone);
const MemoizedEmptyTimeline = React.memo(EmptyTimeline);
const MemoizedMixer = React.memo(Mixer);
const MemoizedToolbar = React.memo(Toolbar);

export default Workstation;
