import { UploadOutlined } from '@ant-design/icons';
import { Typography, Button } from 'antd';
import classNames from 'classnames';
import React, { useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import './Dropzone.css';

type DropzoneProps = {
  setIsDragActive(isDragActive: boolean): void;
  setRootProps(rootProps: any): void;
  uploadFile(file: File): void;
};

const Dropzone = (props: DropzoneProps) => {
  const { setIsDragActive, setRootProps, uploadFile } = props;

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
    setIsDragActive(isDragActive);
  }, [setIsDragActive, isDragActive]);

  useEffect(() => {
    setRootProps(getRootProps());
  }, [setRootProps, getRootProps]);

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
    <div className={dropzoneClass}>
      <input {...getInputProps()} />
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
