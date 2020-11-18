import React from 'react';
import Fullscreen, { useFullScreenHandle } from '../fullscreen/Fullscreen';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import { useUploadFile } from './projectPageEffects';
import ProjectPageHeader from './ProjectPageHeader';
import { ProjectDispatch } from './useProjectDispatch';
import useProjectReducer from './useProjectReducer';

const ProjectPage = () => {
  const [state, dispatch] = useProjectReducer();

  const uploadFile = useUploadFile(dispatch);

  const fullScreenHandle = useFullScreenHandle();

  const toggleFullscreen = (state?: boolean) => {
    const activateFullscreen = state ?? !fullScreenHandle.active;
    if (activateFullscreen) {
      fullScreenHandle.enter();
    } else {
      fullScreenHandle.exit();
    }
  };

  return (
    <ProjectDispatch.Provider value={dispatch}>
      <Fullscreen handle={fullScreenHandle}>
        <PageLayout>
          <PageHeader>
            <MemoizedProjectPageHeader
              title={state.title}
              uploadFile={uploadFile}
              isFullscreen={fullScreenHandle.active}
              toggleFullscreen={toggleFullscreen}
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
