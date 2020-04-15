import { message } from 'antd';
import React, { useCallback } from 'react';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import ProjectPageHeader from './ProjectPageHeader';
import { ProjectDispatch } from './useProjectContext';
import useProjectEffect from './useProjectEffect';
import useProjectState, {
  DECODE_AUDIO_BUFFER,
  ProjectState,
} from './useProjectState';

const initialState: ProjectState = {
  nextTrackId: 0,
  title: 'Untitled',
  tracks: [],
};

const ProjectPage = () => {
  console.log('ProjectPage render');

  const [state, dispatch] = useProjectState(initialState);

  useProjectEffect(state, dispatch);

  const { title } = state;

  const uploadFileCallback = useCallback(
    (file: File) => {
      const messageKey = 'uploadFile';
      const reader = new FileReader();
      reader.onabort = () =>
        message.info({ content: file.name, key: messageKey });
      reader.onerror = () =>
        message.error({ content: file.name, key: messageKey });
      reader.onload = () => {
        dispatch([DECODE_AUDIO_BUFFER, reader.result as ArrayBuffer]);
        message.success({ content: file.name, key: messageKey });
      };
      message.loading({ content: file.name, key: messageKey });
      reader.readAsArrayBuffer(file);
    },
    [dispatch]
  );

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
