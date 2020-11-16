import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import React from 'react';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';
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

  const fullscreenHandle = useFullScreenHandle();
  const fullScreenButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={
        fullscreenHandle.active ? (
          <FullscreenExitOutlined />
        ) : (
          <FullscreenOutlined />
        )
      }
      title={fullscreenHandle.active ? 'Exit fullscreen' : 'Enter fullscreen'}
      onClick={
        fullscreenHandle.active ? fullscreenHandle.exit : fullscreenHandle.enter
      }
    />
  );

  return (
    <ProjectDispatch.Provider value={dispatch}>
      <FullScreen handle={fullscreenHandle}>
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
        <div className="fullscreen__button">{fullScreenButton}</div>
      </FullScreen>
    </ProjectDispatch.Provider>
  );
};

const MemoizedProjectPageHeader = React.memo(ProjectPageHeader);

export default ProjectPage;
