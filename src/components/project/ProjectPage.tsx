import { message } from 'antd';
import React, { useCallback, useMemo } from 'react';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import ProjectPageHeader from './ProjectPageHeader';
import { ProjectDispatch } from './useProjectContext';
import useProjectEffect from './useProjectEffect';
import useProjectState, {
  DECODE_BUFFER,
  ProjectState,
} from './useProjectState';

const initialState: ProjectState = {
  tracks: [],
  nextTrackId: 0,
  bufferToDecode: null,
};

const ProjectPage = () => {
  console.log('ProjectPage render');

  const [state, dispatch] = useProjectState(initialState);

  useProjectEffect(state, dispatch);

  const uploadFileCallback = useCallback(
    (file: File) => {
      const messageKey = 'uploadFile';
      const reader = new FileReader();
      reader.onabort = () =>
        message.info({ content: file.name, key: messageKey });
      reader.onerror = () =>
        message.error({ content: file.name, key: messageKey });
      reader.onload = () => {
        dispatch([DECODE_BUFFER, reader.result as ArrayBuffer]);
        message.success({ content: file.name, key: messageKey });
      };
      message.loading({ content: file.name, key: messageKey });
      reader.readAsArrayBuffer(file);
    },
    [dispatch]
  );

  // TODO: optimize rendering with React.memo, React.useMemo and React.useCallback
  const memoizedProjectPageHeader = useMemo(
    () => <ProjectPageHeader uploadFile={uploadFileCallback} />,
    [uploadFileCallback]
  );

  return (
    <ProjectDispatch.Provider value={dispatch}>
      <PageLayout>
        <PageHeader>{memoizedProjectPageHeader}</PageHeader>
        <PageContent>
          <Workstation tracks={state.tracks} uploadFile={uploadFileCallback} />
        </PageContent>
      </PageLayout>
    </ProjectDispatch.Provider>
  );
};

export default ProjectPage;
