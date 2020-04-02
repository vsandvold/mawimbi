import { UploadOutlined } from '@ant-design/icons';
import { Button, message, PageHeader as AntPageHeader } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import Tone from 'tone';
import useKeyPress from '../hooks/useKeyPress';
import AudioService from '../services/AudioService';
import Dropzone from './Dropzone';
import Mixer from './Mixer';
import { PageContent, PageHeader, PageLayout } from './PageLayout';
import './ProjectPage.css';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import classNames from 'classnames';

type ProjectPageHeaderProps = {
  uploadFile: any;
};

const ProjectPageHeader = ({ uploadFile }: ProjectPageHeaderProps) => {
  const history = useHistory();

  const handleFileUpload = () => {
    alert('Not implemented.');
  };

  return (
    <AntPageHeader
      ghost={false}
      onBack={() => history.goBack()}
      title="Mawimbi"
      subTitle="New Wave"
      extra={[
        <Button
          type="link"
          ghost
          icon={<UploadOutlined />}
          title="Upload audio file"
          onClick={handleFileUpload}
        />,
      ]}
    />
  );
};

const ProjectPage = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (isPlaying) {
      Tone.Transport.start();
    } else {
      Tone.Transport.pause();
    }
  }, [isPlaying]);

  useKeyPress(() => setIsPlaying((prevIsPlaying) => !prevIsPlaying), {
    targetKey: ' ',
  });

  const [audioBuffers, setAudioBuffers] = useState<AudioBuffer[]>([]);

  function uploadFile(file: File) {
    const messageKey = 'uploadFile';
    const reader = new FileReader();
    reader.onabort = () =>
      message.info({ content: file.name, key: messageKey });
    reader.onerror = () =>
      message.error({ content: file.name, key: messageKey });
    reader.onload = async () => {
      message.loading({ content: file.name, key: messageKey });
      const decodedData = await AudioService.decodeAudioData(
        reader.result as ArrayBuffer
      );
      setAudioBuffers((prevBuffers) => [...prevBuffers, decodedData]);
      message.success({ content: file.name, key: messageKey });
    };
    reader.readAsArrayBuffer(file);
  }

  const stopPlayback = () => {
    Tone.Transport.stop();
    setIsPlaying(false);
  };

  const pixelsPerSecond = 200;

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const editorDrawerClass = classNames('editor__drawer', {
    'editor__drawer--closed': !isDrawerOpen,
  });

  const isFileDragging = useFileDragging();

  const editorDropzoneClass = classNames('editor__dropzone', {
    'editor__dropzone--hidden': !isFileDragging,
  });

  // TODO: optimize rendering with React.memo, React.useMemo and React.useCallback

  console.log('ProjectPage render');

  return (
    <PageLayout>
      <PageHeader>
        <ProjectPageHeader uploadFile={uploadFile} />
      </PageHeader>
      <PageContent>
        <div className="project">
          <div className="editor">
            <Scrubber
              isPlaying={isPlaying}
              stopPlayback={stopPlayback}
              pixelsPerSecond={pixelsPerSecond}
            >
              <Timeline
                audioBuffers={audioBuffers}
                pixelsPerSecond={pixelsPerSecond}
              />
            </Scrubber>
            <div className={editorDrawerClass}>
              <Mixer audioBuffers={audioBuffers} />
            </div>
            <div className={editorDropzoneClass}>
              <Dropzone uploadFile={uploadFile} />
            </div>
          </div>
          <Toolbar
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            isDrawerOpen={isDrawerOpen}
            setIsDrawerOpen={setIsDrawerOpen}
          />
        </div>
      </PageContent>
    </PageLayout>
  );
};

const useFileDragging = () => {
  const [isFileDragging, setIsFileDragging] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current++;
    if (
      event.dataTransfer &&
      event.dataTransfer.items &&
      event.dataTransfer.items.length > 0
    ) {
      setIsFileDragging(true);
    }
  };

  const onDragLeave = (event: DragEvent) => {
    // FIXME: does not trigger correctly when drag leaves window
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsFileDragging(false);
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsFileDragging(false);
  };

  return isFileDragging;
};

export default ProjectPage;
