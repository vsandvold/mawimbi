import React from 'react';
import { useFullScreenHandle } from 'react-full-screen';
import Fullscreen from '../fullscreen/Fullscreen';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import { useUploadFile } from './projectPageEffects';
import ProjectPageHeader from './ProjectPageHeader';
import { ProjectDispatch } from './useProjectDispatch';
import useProjectReducer from './useProjectReducer';

const ProjectPage = () => {
  const [state, dispatch] = useProjectReducer();

  const fullScreenHandle = useFullScreenHandle();
  const uploadFile = useUploadFile(dispatch);

  return (
    <ProjectDispatch.Provider value={dispatch}>
      <Fullscreen handle={fullScreenHandle}>
        <PageLayout>
          <PageHeader>
            <MemoizedProjectPageHeader
              title={state.title}
              uploadFile={uploadFile}
            />
          </PageHeader>
          <PageContent>
            <Workstation tracks={state.tracks} uploadFile={uploadFile} />
          </PageContent>
        </PageLayout>
      </Fullscreen>
    </ProjectDispatch.Provider>
  );
};

const MemoizedProjectPageHeader = React.memo(ProjectPageHeader);

export default ProjectPage;
