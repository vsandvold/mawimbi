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
};

const Workstation = ({ tracks, uploadFile }: WorkstationProps) => {
  console.log('Workstation render');

  const [state, dispatch] = useWorkstationState(initialState);
  const [stopPlayback] = useWorkstationEffect(state, dispatch);
  const isFileDragging = useFileDragging();

  const { isPlaying, pixelsPerSecond, isDrawerOpen } = state;

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
            <Scrubber
              isPlaying={isPlaying}
              stopPlayback={stopPlayback}
              pixelsPerSecond={pixelsPerSecond}
            >
              <Timeline tracks={tracks} pixelsPerSecond={pixelsPerSecond} />
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
