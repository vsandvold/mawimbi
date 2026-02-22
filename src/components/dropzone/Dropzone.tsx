import { UploadOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import classNames from 'classnames';
import React from 'react';
import './Dropzone.css';

type DropzoneProps = {
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
};

const Dropzone = (props: DropzoneProps) => {
  const { isDragActive, isDragAccept, isDragReject, inputProps } = props;

  const dropzoneClass = classNames('dropzone', {
    'dropzone--active': isDragActive,
    'dropzone--accept': isDragAccept,
    'dropzone--reject': isDragReject,
  });

  const { Title, Text } = Typography;

  return (
    <div className={dropzoneClass}>
      <input {...inputProps} />
      <div className="dropzone__content">
        <Text>
          <UploadOutlined className="upload-icon" />
        </Text>
        {isDragAccept && (
          <Title level={4}>Drag and drop audio files here</Title>
        )}
        {isDragReject && (
          <Title level={4}>Oops, this does not look like an audio file</Title>
        )}
        <Text>All audio files are accepted</Text>
      </div>
    </div>
  );
};

export default Dropzone;
