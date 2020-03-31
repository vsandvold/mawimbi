import { InboxOutlined } from '@ant-design/icons';
import React, { useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import './Dropzone.css';

type DropzoneProps = {
  uploadFile(file: File): void;
};

const Dropzone = ({ uploadFile }: DropzoneProps) => {
  const {
    acceptedFiles,
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject
  } = useDropzone({
    accept: 'audio/*',
    multiple: true,
    noClick: true,
    noKeyboard: true
  });

  // TODO: consider re-introducing useCallback

  useEffect(() => {
    acceptedFiles.forEach(uploadFile);
  }, [acceptedFiles]);

  console.log('Dropzone render');

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
