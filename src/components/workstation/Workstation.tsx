import classNames from 'classnames';
import React, { useMemo } from 'react';
import useFileDragging from '../../hooks/useFileDragging';
import Dropzone from '../dropzone/Dropzone';
import { Track } from '../project/useProjectState';
import Mixer from './Mixer';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import { WorkstationDispatch } from './useWorkstationContext';
import useWorkstationEffect from './useWorkstationEffect';
import useWorkstationState, { WorkstationState } from './useWorkstationState';
import './Workstation.css';

type WorkstationProps = {
  tracks: Track[];
  uploadFile: (file: File) => void;
};

const initialState: WorkstationState = {
  isDrawerOpen: false,
  isPlaying: false,
  pixelsPerSecond: 200,
  focusedTracks: [],
  seekTransportTime: 0,
};

const Workstation = ({ tracks, uploadFile }: WorkstationProps) => {
  console.log('Workstation render');

  const [state, dispatch] = useWorkstationState(initialState);
  const [] = useWorkstationEffect(state, dispatch);

  const { isPlaying, pixelsPerSecond, isDrawerOpen, focusedTracks } = state;
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
                pixelsPerSecond={pixelsPerSecond}
                focusedTracks={focusedTracks}
                tracks={tracks}
              />
            </Scrubber>
          </div>
          <div className={editorDrawerClass}>
            <Mixer tracks={tracks} />
          </div>
          <div className={editorDropzoneClass}>{memoizedDropzone}</div>
        </div>
        {memoizedToolbar}
      </div>
    </WorkstationDispatch.Provider>
  );
};

export default Workstation;
