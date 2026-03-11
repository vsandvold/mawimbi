import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import Fullscreen from '../fullscreen/Fullscreen';
import { PageContent, PageLayout } from '../layout/PageLayout';
import LogOverlay from '../LogOverlay';
import Workstation from '../workstation/Workstation';
import './ProjectPage.css';
import {
  useAutoSave,
  useDeleteTrackAudio,
  useFullscreen,
  useLoadProject,
  useRestoreAudio,
  useTrackSideEffects,
  useUploadFile,
} from './projectPageEffects';
import { COLOR_PALETTE, type ProjectState } from './projectPageReducer';
import FloatingBackButton from './FloatingBackButton';
import { ProjectDispatch } from './useProjectDispatch';
import useProjectReducer from './useProjectReducer';

const ProjectPage = () => {
  const { id } = useParams<{ id: string }>();
  const initialState = useLoadProject(id!);

  if (!initialState) {
    return null;
  }

  return <ProjectPageContent key={id} initialState={initialState} />;
};

type ProjectPageContentProps = {
  initialState: ProjectState;
};

const ProjectPageContent = ({ initialState }: ProjectPageContentProps) => {
  const [state, dispatch, undoControls] = useProjectReducer(initialState);
  const [isLogOverlayOpen, setIsLogOverlayOpen] = useState(false);

  const uploadFile = useUploadFile(dispatch);
  const [fullScreenHandle, toggleFullscreen] = useFullscreen();
  const isRestoringAudio = useRestoreAudio(initialState.tracks);
  useTrackSideEffects(state.tracks);
  useDeleteTrackAudio(state.tracks);
  useAutoSave(state);

  const toggleLogOverlay = useCallback(
    () => setIsLogOverlayOpen((prev) => !prev),
    [],
  );

  const recordingColor = COLOR_PALETTE[state.nextColorId];

  if (isRestoringAudio) {
    return null;
  }

  return (
    <ProjectDispatch.Provider value={dispatch}>
      <Fullscreen handle={fullScreenHandle}>
        <PageLayout>
          <PageContent>
            <Workstation
              recordingColor={recordingColor}
              tracks={state.tracks}
              uploadFile={uploadFile}
              isFullscreen={fullScreenHandle.active}
              toggleFullscreen={toggleFullscreen}
              isLogOverlayOpen={isLogOverlayOpen}
              toggleLogOverlay={toggleLogOverlay}
              undo={undoControls.undo}
              redo={undoControls.redo}
              canUndo={undoControls.canUndo}
              canRedo={undoControls.canRedo}
            />
          </PageContent>
        </PageLayout>
        <FloatingBackButton />
        <LogOverlay isOpen={isLogOverlayOpen} onClose={toggleLogOverlay} />
      </Fullscreen>
    </ProjectDispatch.Provider>
  );
};

export default ProjectPage;
