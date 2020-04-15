import classNames from 'classnames';
import React, { useEffect } from 'react';
import useFileDragging from '../../hooks/useFileDragging';
import Dropzone from '../dropzone/Dropzone';
import { Track } from '../project/useProjectState';
import Mixer from './Mixer';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import { WorkstationDispatch } from './useWorkstationContext';
import useWorkstationEffect from './useWorkstationEffect';
import useWorkstationState, {
  SET_MUTED_TRACKS,
  WorkstationState,
} from './useWorkstationState';
import './Workstation.css';

type WorkstationProps = {
  tracks: Track[];
  uploadFile: (file: File) => void;
};

const initialState: WorkstationState = {
  focusedTracks: [],
  isDrawerOpen: false,
  isPlaying: false,
  mutedTracks: [],
  pixelsPerSecond: 200,
  transportTime: 0,
};

const Workstation = ({ tracks, uploadFile }: WorkstationProps) => {
  console.log('Workstation render');

  const [state, dispatch] = useWorkstationState(initialState);
  const {
    timelineScaleFactor,
    timelineContainerRef,
    drawerContainerRef,
  } = useWorkstationEffect(state, dispatch);

  useEffect(() => {
    const hasSoloTracks = tracks.filter((track) => track.solo).length > 0;
    const mutedTracks = tracks
      .filter((track) => isTrackMuted(track, hasSoloTracks))
      .map((track) => track.id);
    dispatch([SET_MUTED_TRACKS, mutedTracks]);
  }, [tracks, dispatch]);

  const {
    focusedTracks,
    isDrawerOpen,
    isPlaying,
    mutedTracks,
    pixelsPerSecond,
    transportTime,
  } = state;

  const isFileDragging = useFileDragging();

  const editorDrawerClass = classNames('editor__drawer', {
    'editor__drawer--closed': !isDrawerOpen,
  });

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isFileDragging,
  });

  const hasTracks = tracks.length > 0;

  // TODO: optimize rendering with React.memo, React.useMemo and React.useCallback
  return (
    <WorkstationDispatch.Provider value={dispatch}>
      <div className="workstation">
        <div className="editor">
          <div
            ref={timelineContainerRef}
            className="editor__timeline"
            style={getTimelineStyle(isDrawerOpen, timelineScaleFactor)}
          >
            <Scrubber
              isPlaying={isPlaying}
              pixelsPerSecond={pixelsPerSecond}
              transportTime={transportTime}
            >
              <MemoizedTimeline
                focusedTracks={focusedTracks}
                mutedTracks={mutedTracks}
                pixelsPerSecond={pixelsPerSecond}
                tracks={tracks}
              />
            </Scrubber>
          </div>
          <div ref={drawerContainerRef} className={editorDrawerClass}>
            <MemoizedMixer mutedTracks={mutedTracks} tracks={tracks} />
          </div>
          <div className={editorDropzoneClass}>
            <MemoizedDropzone uploadFile={uploadFile} />
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

function isTrackMuted(track: Track, hasSoloTracks: boolean): boolean {
  return !track.solo && (track.mute || (hasSoloTracks && !track.solo));
}

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
const MemoizedTimeline = React.memo(Timeline);

export default Workstation;
