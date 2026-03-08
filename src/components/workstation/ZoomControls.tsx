import { Minus, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { type CSSProperties } from 'react';
import { useRecordingService } from '../../hooks/useRecordingService';
import { useWorkstation } from '../../hooks/useWorkstation';
import './ZoomControls.css';

type ZoomControlsProps = {
  style?: CSSProperties;
};

const ZoomControls = ({ style }: ZoomControlsProps) => {
  const { isRecording } = useRecordingService();
  const { isMaxZoom, isMinZoom, zoomIn, zoomOut } = useWorkstation();

  return (
    <div className="zoom-controls" style={style}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="button zoom-controls__button"
        title="Zoom in"
        onClick={zoomIn}
        disabled={isMaxZoom || isRecording}
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="button zoom-controls__button"
        title="Zoom out"
        onClick={zoomOut}
        disabled={isMinZoom || isRecording}
      >
        <Minus />
      </Button>
    </div>
  );
};

export default ZoomControls;
