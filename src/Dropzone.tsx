import { InboxOutlined } from '@ant-design/icons';
import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './Dropzone.css';

type DropzoneProps = {
  uploadFile(file: File): void;
};

const Dropzone = ({ uploadFile }: DropzoneProps) => {
  const onDrop = useCallback(
    acceptedFiles => {
      acceptedFiles.forEach(uploadFile);
    },
    [uploadFile]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject
  } = useDropzone({
    onDrop,
    noClick: true,
    multiple: true,
    accept: 'audio/*'
  });

  return (
    <div
      {...getRootProps()}
      className={`ant-upload ant-upload-drag ${
        isDragActive ? 'ant-upload-drag-active' : ''
      }`}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <div className="ant-upload-drag-container">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Drag file to this area to upload</p>
          <p className="ant-upload-hint">
            Support for a single or bulk upload. Strictly prohibit from
            uploading company data or other band files
          </p>
          {isDragReject ? <div>Only audio files accepted</div> : null}
        </div>
      ) : null}
    </div>
  );
};

export default Dropzone;
