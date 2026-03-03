import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
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
