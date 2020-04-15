import { UploadOutlined } from '@ant-design/icons';
import React, { useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import './Dropzone.css';
import classNames from 'classnames';
import { Typography } from 'antd';

type DropzoneProps = {
  uploadFile(file: File): void;
};

const Dropzone = ({ uploadFile }: DropzoneProps) => {
  console.log('Dropzone render');

  const {
    acceptedFiles,
    getRootProps,
    getInputProps,
    isDragActive,
    isDragAccept,
    isDragReject,
  } = useDropzone({
    accept: 'audio/*',
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  useEffect(() => {
    acceptedFiles.forEach(uploadFile);
  }, [acceptedFiles, uploadFile]);

  const dropzoneClass = classNames('dropzone', {
    'dropzone--active': isDragActive,
    'dropzone--accept': isDragAccept,
    'dropzone--reject': isDragReject,
  });

  const { Title, Text } = Typography;

  return (
    <div
      {...getRootProps({
        className: dropzoneClass,
      })}
    >
      <input {...getInputProps()} />
      <div className="dropzone__content">
        <Text>
          <UploadOutlined className="upload-icon" />
        </Text>
        <Title level={4}>Drag and drop audio files here</Title>
        <Text>All audio files are accepted</Text>
      </div>
    </div>
  );
};

export default Dropzone;
