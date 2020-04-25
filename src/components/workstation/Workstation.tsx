import { Typography } from 'antd';
import classNames from 'classnames';
import React, { useEffect, useMemo } from 'react';
import Dropzone from '../dropzone/Dropzone';
import { Track } from '../project/useProjectState';
import Mixer from './Mixer';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import { WorkstationDispatch } from './useWorkstationContext';
import useWorkstationEffect from './useWorkstationEffect';
import useWorkstationState from './useWorkstationState';
import './Workstation.css';
import { SET_MUTED_TRACKS } from './workstationReducer';

type WorkstationProps = {
  tracks: Track[];
  uploadFile: (file: File) => void;
};

const Workstation = ({ tracks, uploadFile }: WorkstationProps) => {
  console.log('Workstation render');

  const [state, dispatch] = useWorkstationState();
  const {
    timelineScaleFactor,
    timelineContainerRef,
    drawerContainerRef,
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  } = useWorkstationEffect(state, dispatch);

  const hasTracks = tracks.length > 0;

  useEffect(() => {
    function isTrackMuted(track: Track, hasSoloTracks: boolean): boolean {
      return !track.solo && (track.mute || (hasSoloTracks && !track.solo));
    }

    const hasSoloTracks = tracks.filter((track) => track.solo).length > 0;
    const mutedTracks = tracks
      .filter((track) => isTrackMuted(track, hasSoloTracks))
      .map((track) => track.id);
    dispatch([SET_MUTED_TRACKS, mutedTracks]);
  }, [tracks]); // dispatch never changes, and can safely be omitted from dependencies

  const {
    focusedTracks,
    isDrawerOpen,
    isPlaying,
    mutedTracks,
    pixelsPerSecond,
    transportTime,
  } = state;

  const editorDrawerClass = classNames('editor__drawer', {
    'editor__drawer--closed': !isDrawerOpen,
  });

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isDragActive,
  });

  // TODO: optimize rendering with React.memo, React.useMemo and React.useCallback
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

  const memoizedEmptyTimeline = useMemo(
    () => (isDragActive ? null : <EmptyTimeline />),
    [isDragActive]
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
            {hasTracks ? memoizedScrubberTimeline : memoizedEmptyTimeline}
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
const MemoizedMixer = React.memo(Mixer);
const MemoizedToolbar = React.memo(Toolbar);

const EmptyTimeline = () => {
  console.log('EmptyTimeline render');

  function isTouchEnabled() {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    );
  }

  const { Title, Text } = Typography;

  return (
    <div className="empty-timeline">
      <Title level={4} type="secondary">
        Upload audio files to get started
      </Title>
      {isTouchEnabled() ? (
        <Text type="secondary">Use the upload button above</Text>
      ) : (
        <Text type="secondary">
          Drag files here, or use the upload button above
        </Text>
      )}
    </div>
  );
};

export default Workstation;
