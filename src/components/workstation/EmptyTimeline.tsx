import { Typography } from 'antd';
import React from 'react';
import { useBrowserSupport } from '../../browserSupport';

type EmptyTimelineProps = {
  isDragActive: boolean;
};

const EmptyTimeline = ({ isDragActive }: EmptyTimelineProps) => {
  const { Title, Text } = Typography;

  const browserSupport = useBrowserSupport();

  return isDragActive ? null : (
    <div className="empty-timeline">
      <Title level={4} type="secondary">
        Upload audio files to get started
      </Title>
      {browserSupport.touchEvents ? (
        <Text type="secondary">Use the upload button above</Text>
      ) : (
        <Text type="secondary">
          Drop files here, or use the upload button above
        </Text>
      )}
    </div>
  );
};

export default EmptyTimeline;
