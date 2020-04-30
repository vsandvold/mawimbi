import React from 'react';
import { Typography } from 'antd';

type EmptyTimelineProps = {
  isDragActive: boolean;
};

const EmptyTimeline = ({ isDragActive }: EmptyTimelineProps) => {
  console.log('EmptyTimeline render');

  const { Title, Text } = Typography;

  return isDragActive ? null : (
    <div className="empty-timeline">
      <Title level={4} type="secondary">
        Upload audio files to get started
      </Title>
      {isTouchEnabled() ? (
        <Text type="secondary">Use the upload button above</Text>
      ) : (
        <Text type="secondary">
          Drop files here, or use the upload button above
        </Text>
      )}
    </div>
  );
};

function isTouchEnabled() {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

export default EmptyTimeline;
