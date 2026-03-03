import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { useSignals } from '@preact/signals-react/runtime';
import { Button } from 'antd';
import { type CSSProperties } from 'react';
import { useRecordingService } from '../../hooks/useAudioService';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  pixelsPerSecond as pixelsPerSecondSignal,
  zoomIn,
  zoomOut,
} from '../../signals/workstationSignals';
import './ZoomControls.css';

type ZoomControlsProps = {
  style?: CSSProperties;
};

const ZoomControls = ({ style }: ZoomControlsProps) => {
  useSignals();
  const recordingService = useRecordingService();
  const pixelsPerSecond = pixelsPerSecondSignal.value;
  const isRecording = recordingService.isRecording.value;
  const isMaxZoom = pixelsPerSecond >= MAX_PIXELS_PER_SECOND;
  const isMinZoom = pixelsPerSecond <= MIN_PIXELS_PER_SECOND;

  return (
    <div className="zoom-controls" style={style}>
      <Button
        type="link"
        size="small"
        className="button zoom-controls__button"
        icon={<PlusOutlined />}
        title="Zoom in"
        onClick={zoomIn}
        disabled={isMaxZoom || isRecording}
      />
      <Button
        type="link"
        size="small"
        className="button zoom-controls__button"
        icon={<MinusOutlined />}
        title="Zoom out"
        onClick={zoomOut}
        disabled={isMinZoom || isRecording}
      />
    </div>
  );
};

export default ZoomControls;
