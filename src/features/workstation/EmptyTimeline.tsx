import { useBrowserSupport } from '../../browserSupport';

type EmptyTimelineProps = {
  isDragActive: boolean;
};

const EmptyTimeline = ({ isDragActive }: EmptyTimelineProps) => {
  const browserSupport = useBrowserSupport();

  return isDragActive ? null : (
    <div className="empty-timeline">
      <h4 className="text-xl font-semibold text-muted-foreground">
        Start recording, or upload some audio files
      </h4>
      {browserSupport.touchEvents ? (
        <span className="text-muted-foreground">
          Use the upload button below
        </span>
      ) : (
        <span className="text-muted-foreground">
          Drop files here, or use the upload button below
        </span>
      )}
    </div>
  );
};

export default EmptyTimeline;
