import { Upload } from 'lucide-react';
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

  return (
    <div className={dropzoneClass}>
      <input {...inputProps} />
      <div className="dropzone__content">
        <span>
          <Upload className="upload-icon" />
        </span>
        {isDragAccept && (
          <h4 className="text-xl font-semibold">
            Drag and drop audio files here
          </h4>
        )}
        {isDragReject && (
          <h4 className="text-xl font-semibold">
            Oops, this does not look like an audio file
          </h4>
        )}
        <span>All audio files are accepted</span>
      </div>
    </div>
  );
};

export default Dropzone;
