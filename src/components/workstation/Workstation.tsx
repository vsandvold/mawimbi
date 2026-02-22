import classNames from 'classnames';
import { useAudioBridge } from '../../hooks/useAudioBridge';
import { useTransportBridge } from '../../hooks/useTransportBridge';
import Dropzone from '../dropzone/Dropzone';
import { Track } from '../project/projectPageReducer';
import EmptyTimeline from './EmptyTimeline';
import Mixer from './Mixer';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import { WorkstationDispatch } from './useWorkstationDispatch';
import useWorkstationReducer from './useWorkstationReducer';
import './Workstation.css';
import {
  useDropzoneDragActive,
  useMicrophone,
  useMixerHeight,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from './workstationEffects';

type WorkstationProps = {
  tracks: Track[];
  uploadFile: (file: File) => void;
};

const Workstation = (props: WorkstationProps) => {
  const [state, dispatch] = useWorkstationReducer();

  const { tracks, uploadFile } = props;
  const hasTracks = tracks.length > 0;

  const { isMixerOpen, isRecording, pixelsPerSecond } = state;

  const { mixerContainerRef, mixerHeight } = useMixerHeight();
  const {
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  } = useDropzoneDragActive();

  const trackIds = tracks.map((t) => t.trackId);
  useAudioBridge(trackIds);
  useTransportBridge();
  useSpacebarPlaybackToggle();
  useTotalTime(tracks);
  useMicrophone(isRecording);

  const editorMixerClass = classNames('editor__mixer', {
    'editor__mixer--closed': !isMixerOpen,
  });

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isDragActive,
  });

  return (
    <WorkstationDispatch.Provider value={dispatch}>
      <div className="workstation">
        <div className="editor" {...dropzoneRootProps}>
          <div className="editor__timeline">
            {hasTracks ? (
              <Scrubber
                drawerHeight={mixerHeight}
                isMixerOpen={isMixerOpen}
                pixelsPerSecond={pixelsPerSecond}
              >
                <Timeline pixelsPerSecond={pixelsPerSecond} tracks={tracks} />
              </Scrubber>
            ) : (
              <EmptyTimeline isDragActive={isDragActive} />
            )}
          </div>
          <div ref={mixerContainerRef} className={editorMixerClass}>
            <Mixer tracks={tracks} />
          </div>
          <div className={editorDropzoneClass}>
            <Dropzone
              setIsDragActive={setIsDragActive}
              setRootProps={setDropzoneRootProps}
              uploadFile={uploadFile}
            />
          </div>
        </div>
        <div className="workstation__toolbar">
          <Toolbar
            isMixerOpen={isMixerOpen}
            isEmpty={!hasTracks}
            isRecording={isRecording}
          />
        </div>
      </div>
    </WorkstationDispatch.Provider>
  );
};

export default Workstation;
