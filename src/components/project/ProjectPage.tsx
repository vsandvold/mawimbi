import { message } from 'antd';
import React, { useCallback } from 'react';
import AudioService from '../../services/AudioService';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import ProjectPageHeader from './ProjectPageHeader';
import { ADD_TRACK } from './projectReducer';
import { ProjectDispatch } from './useProjectDispatch';
import useProjectEffects from './useProjectEffects';
import useProjectReducer from './useProjectReducer';

const ProjectPage = () => {
  console.log('ProjectPage render');

  const [state, dispatch] = useProjectReducer();

  useProjectEffects(state, dispatch);

  const { title } = state;

  const uploadFileCallback = useCallback((file: File) => {
    const messageKey = 'uploadFile';
    const reader = new FileReader();
    reader.onabort = () =>
      message.info({ content: file.name, key: messageKey });
    reader.onerror = () =>
      message.error({ content: file.name, key: messageKey });
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      AudioService.decodeAudioData(arrayBuffer)
        .then((audioBuffer) => {
          dispatch([ADD_TRACK, audioBuffer]);
          message.success({ content: file.name, key: messageKey });
        })
        .catch((error) => {
          message.error({ content: `${file.name}: ${error}`, key: messageKey });
        });
    };
    message.loading({ content: file.name, key: messageKey });
    reader.readAsArrayBuffer(file);
  }, []); // dispatch never changes, and can safely be omitted from dependencies

  // TODO: optimize rendering with React.memo, React.useMemo and React.useCallback
  return (
    <ProjectDispatch.Provider value={dispatch}>
      <PageLayout>
        <PageHeader>
          <MemoizedProjectPageHeader
            title={title}
            uploadFile={uploadFileCallback}
          />
        </PageHeader>
        <PageContent>
          <Workstation tracks={state.tracks} uploadFile={uploadFileCallback} />
        </PageContent>
      </PageLayout>
    </ProjectDispatch.Provider>
  );
};

const MemoizedProjectPageHeader = React.memo(ProjectPageHeader);

export default ProjectPage;
