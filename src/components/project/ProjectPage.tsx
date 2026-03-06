import { useParams } from 'react-router-dom';
import Fullscreen from '../fullscreen/Fullscreen';
import { PageContent, PageHeader, PageLayout } from '../layout/PageLayout';
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
import {
  COLOR_PALETTE,
  RENAME_PROJECT,
  type ProjectState,
} from './projectPageReducer';
import ProjectPageHeader from './ProjectPageHeader';
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

  const uploadFile = useUploadFile(dispatch);
  const [fullScreenHandle, toggleFullscreen] = useFullscreen();
  const isRestoringAudio = useRestoreAudio(initialState.tracks);
  useTrackSideEffects(state.tracks);
  useDeleteTrackAudio(state.tracks);
  useAutoSave(state);

  const recordingColor = COLOR_PALETTE[state.nextColorId];

  if (isRestoringAudio) {
    return null;
  }

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
              renameProject={(title) => dispatch([RENAME_PROJECT, { title }])}
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
