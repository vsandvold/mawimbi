import React from 'react';
import Fullscreen, { useFullScreenHandle } from '../fullscreen/Fullscreen';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import { useUploadFile } from './projectPageEffects';
import ProjectPageHeader from './ProjectPageHeader';
import { TOGGLE_FULLSCREEN } from './projectPageReducer';
import { ProjectDispatch } from './useProjectDispatch';
import useProjectReducer from './useProjectReducer';

const ProjectPage = () => {
  const [state, dispatch] = useProjectReducer();

  const fullScreenHandle = useFullScreenHandle();
  const uploadFile = useUploadFile(dispatch);

  const reactivateFullscreen = () => {
    if (state.isFullscreen) {
      fullScreenHandle.enter();
    }
  };

  const updateFullscreenState = (state: boolean) => {
    dispatch([TOGGLE_FULLSCREEN, state]);
  };

  return (
    <ProjectDispatch.Provider value={dispatch}>
      <Fullscreen handle={fullScreenHandle} onClick={updateFullscreenState}>
        <PageLayout>
          <PageHeader>
            <MemoizedProjectPageHeader
              title={state.title}
              reactivateFullscreen={reactivateFullscreen}
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
