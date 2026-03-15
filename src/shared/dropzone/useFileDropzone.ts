import { useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

export function useFileDropzone(uploadFile: (file: File) => void) {
  const {
    acceptedFiles,
    getRootProps,
    getInputProps,
    isDragActive,
    isDragAccept,
    isDragReject,
  } = useDropzone({
    accept: { 'audio/*': [] },
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  useEffect(() => {
    acceptedFiles.forEach(uploadFile);
  }, [acceptedFiles, uploadFile]);

  return {
    isDragActive,
    isDragAccept,
    isDragReject,
    rootProps: getRootProps(),
    inputProps: getInputProps(),
  };
}
