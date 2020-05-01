import React from 'react';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import ProjectPageHeader from './ProjectPageHeader';
import { ProjectDispatch } from './useProjectDispatch';
import { useUploadFile } from './projectPageEffects';
import useProjectReducer from './useProjectReducer';

const ProjectPage = () => {
  const [state, dispatch] = useProjectReducer();

  const { title, tracks } = state;

  const uploadFile = useUploadFile(dispatch);

  return (
    <ProjectDispatch.Provider value={dispatch}>
      <PageLayout>
        <PageHeader>
          <MemoizedProjectPageHeader title={title} uploadFile={uploadFile} />
        </PageHeader>
        <PageContent>
          <Workstation tracks={tracks} uploadFile={uploadFile} />
        </PageContent>
      </PageLayout>
    </ProjectDispatch.Provider>
  );
};

const MemoizedProjectPageHeader = React.memo(ProjectPageHeader);

export default ProjectPage;
