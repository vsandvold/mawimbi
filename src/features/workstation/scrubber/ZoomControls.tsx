import { Minus, Plus } from 'lucide-react';
import { Button } from '../../../shared/ui/button';
import { type CSSProperties, type PointerEventHandler } from 'react';
import { useRecordingService } from '../../recording/useRecordingService';
import { useWorkstation } from '../useWorkstation';
import './ZoomControls.css';

type ZoomControlsProps = {
  style?: CSSProperties;
  // Forwarded to the root element as-is — currently used by the dev tuning
  // overlay (mawimbi#447) to attach its long-press reveal gesture, without
  // coupling this component to tuning specifics.
  onPointerDown?: PointerEventHandler;
  onPointerUp?: PointerEventHandler;
  onPointerLeave?: PointerEventHandler;
};

const ZoomControls = ({
  style,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
}: ZoomControlsProps) => {
  const { isRecording } = useRecordingService();
  const { isMaxZoom, isMinZoom, zoomIn, zoomOut } = useWorkstation();

  return (
    <div
      className="zoom-controls"
      style={style}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="button zoom-controls__button"
        title="Zoom in"
        onClick={zoomIn}
        // Stops the long-press reveal gesture (mawimbi#447) from firing when
        // a normal press-and-hold on the button itself runs past its delay.
        onPointerDown={(e) => e.stopPropagation()}
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
        onPointerDown={(e) => e.stopPropagation()}
        disabled={isMinZoom || isRecording}
      >
        <Minus />
      </Button>
    </div>
  );
};

export default ZoomControls;
