import { UploadOutlined } from '@ant-design/icons';
import { Button, message, PageHeader as AntPageHeader } from 'antd';
import classNames from 'classnames';
import React, { useRef } from 'react';
import { useHistory } from 'react-router-dom';
import useFileDragging from '../../hooks/useFileDragging';
import AudioService from '../../services/AudioService';
import Dropzone from '../dropzone/Dropzone';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Mixer from '../workstation/Mixer';
import Scrubber from '../workstation/Scrubber';
import Timeline from '../workstation/Timeline';
import Toolbar from '../workstation/Toolbar';
import './ProjectPage.css';
import useProjectEffect from './useProjectEffect';
import useProjectState, {
  ADD_TRACK,
  ProjectDispatch,
  ProjectState,
} from './useProjectState';

type ProjectPageHeaderProps = {
  uploadFile: (file: File) => void;
};

const ProjectPageHeader = ({ uploadFile }: ProjectPageHeaderProps) => {
  console.log('ProjectPageHeader render');

  const history = useHistory();

  const handleFileUpload = () => {
    alert('Not implemented.');
  };

  return (
    <AntPageHeader
      ghost={false}
      onBack={() => history.goBack()}
      title="Mawimbi"
      subTitle="New Wave"
      extra={[
        <Button
          key="upload-button"
          type="link"
          ghost
          icon={<UploadOutlined />}
          title="Upload audio file"
          onClick={handleFileUpload}
        />,
      ]}
    />
  );
};

export const initialState: ProjectState = {
  isPlaying: false,
  pixelsPerSecond: 200,
  tracks: [],
  isDrawerOpen: false,
};

const ProjectPage = () => {
  console.log('ProjectPage render');

  const [state, dispatch] = useProjectState(initialState);

  const [stopPlayback] = useProjectEffect(state, dispatch);

  const { isPlaying, pixelsPerSecond, tracks, isDrawerOpen } = state;

  const trackIdRef = useRef(0);

  function uploadFile(file: File) {
    const messageKey = 'uploadFile';
    const reader = new FileReader();
    reader.onabort = () =>
      message.info({ content: file.name, key: messageKey });
    reader.onerror = () =>
      message.error({ content: file.name, key: messageKey });
    reader.onload = async () => {
      message.loading({ content: file.name, key: messageKey });
      const decodedData = await AudioService.decodeAudioData(
        reader.result as ArrayBuffer
      );
      const trackId = trackIdRef.current++;
      dispatch([ADD_TRACK, { id: trackId, audioBuffer: decodedData }]);
      message.success({ content: file.name, key: messageKey });
    };
    reader.readAsArrayBuffer(file);
  }

  const editorDrawerClass = classNames('editor__drawer', {
    'editor__drawer--closed': !isDrawerOpen,
  });

  const isFileDragging = useFileDragging();

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isFileDragging,
  });

  // TODO: optimize rendering with React.memo, React.useMemo and React.useCallback
  return (
    <ProjectDispatch.Provider value={dispatch}>
      <PageLayout>
        <PageHeader>
          <ProjectPageHeader uploadFile={uploadFile} />
        </PageHeader>
        <PageContent>
          <div className="project">
            <div className="editor">
              <div className="editor__scrubber">
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
              <div className={editorDropzoneClass}>
                <Dropzone uploadFile={uploadFile} />
              </div>
            </div>
            <Toolbar isPlaying={isPlaying} isDrawerOpen={isDrawerOpen} />
          </div>
        </PageContent>
      </PageLayout>
    </ProjectDispatch.Provider>
  );
};

export default ProjectPage;
