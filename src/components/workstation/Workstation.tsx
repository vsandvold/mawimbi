import classNames from 'classnames';
import React, { useEffect, useMemo } from 'react';
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
  seekTransportTime: 0,
};

const Workstation = ({ tracks, uploadFile }: WorkstationProps) => {
  console.log('Workstation render');

  const [state, dispatch] = useWorkstationState(initialState);
  const [] = useWorkstationEffect(state, dispatch);

  useEffect(() => {
    const hasSoloTracks = tracks.filter((track) => track.solo).length > 0;
    const mutedTracks = tracks
      .filter((track) => isTrackMuted(track, hasSoloTracks))
      .map((track) => track.id);
    dispatch([SET_MUTED_TRACKS, mutedTracks]);
  }, [tracks]);

  const {
    focusedTracks,
    isDrawerOpen,
    isPlaying,
    mutedTracks,
    pixelsPerSecond,
  } = state;
  const isFileDragging = useFileDragging();

  const editorDrawerClass = classNames('editor__drawer', {
    'editor__drawer--closed': !isDrawerOpen,
  });

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isFileDragging,
  });

  // TODO: optimize rendering with React.memo, React.useMemo and React.useCallback
  const memoizedDropzone = useMemo(() => <Dropzone uploadFile={uploadFile} />, [
    uploadFile,
  ]);

  const memoizedToolbar = useMemo(
    () => <Toolbar isPlaying={isPlaying} isDrawerOpen={isDrawerOpen} />,
    [isPlaying, isDrawerOpen]
  );

  return (
    <WorkstationDispatch.Provider value={dispatch}>
      <div className="workstation">
        <div className="editor">
          <div className="editor__timeline">
            <Scrubber isPlaying={isPlaying} pixelsPerSecond={pixelsPerSecond}>
              <Timeline
                focusedTracks={focusedTracks}
                mutedTracks={mutedTracks}
                pixelsPerSecond={pixelsPerSecond}
                tracks={tracks}
              />
            </Scrubber>
          </div>
          <div className={editorDrawerClass}>
            <Mixer mutedTracks={mutedTracks} tracks={tracks} />
          </div>
          <div className={editorDropzoneClass}>{memoizedDropzone}</div>
        </div>
        {memoizedToolbar}
      </div>
    </WorkstationDispatch.Provider>
  );
};

function isTrackMuted(track: Track, hasSoloTracks: boolean): boolean {
  return !track.solo && (track.mute || (hasSoloTracks && !track.solo));
}

export default Workstation;
