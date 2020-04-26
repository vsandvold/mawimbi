import React from 'react';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import ProjectPageHeader from './ProjectPageHeader';
import { ProjectDispatch } from './useProjectDispatch';
import useProjectEffects from './useProjectEffects';
import useProjectReducer from './useProjectReducer';

const ProjectPage = () => {
  console.log('ProjectPage render');

  const [state, dispatch] = useProjectReducer();

  const { title, tracks } = state;

  const { uploadFile } = useProjectEffects({}, state, dispatch);

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
