import Fullscreen from '../fullscreen/Fullscreen';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import {
  useFullscreen,
  useTrackSideEffects,
  useUploadFile,
} from './projectPageEffects';
import { COLOR_PALETTE } from './projectPageReducer';
import ProjectPageHeader from './ProjectPageHeader';
import { ProjectDispatch } from './useProjectDispatch';
import useProjectReducer from './useProjectReducer';

const ProjectPage = () => {
  const [state, dispatch, undoControls] = useProjectReducer();

  const uploadFile = useUploadFile(dispatch);
  const [fullScreenHandle, toggleFullscreen] = useFullscreen();
  useTrackSideEffects(state.tracks);

  const recordingColor = COLOR_PALETTE[state.nextColorId];

  return (
    <ProjectDispatch.Provider value={dispatch}>
      <Fullscreen handle={fullScreenHandle}>
        <PageLayout>
          <PageHeader>
            <ProjectPageHeader
              title={state.title}
              uploadFile={uploadFile}
              isFullscreen={fullScreenHandle.active}
              toggleFullscreen={toggleFullscreen}
              undo={undoControls.undo}
              redo={undoControls.redo}
              canUndo={undoControls.canUndo}
              canRedo={undoControls.canRedo}
            />
          </PageHeader>
          <PageContent>
            <Workstation
              recordingColor={recordingColor}
              tracks={state.tracks}
              uploadFile={uploadFile}
            />
          </PageContent>
        </PageLayout>
      </Fullscreen>
    </ProjectDispatch.Provider>
  );
};

export default ProjectPage;
