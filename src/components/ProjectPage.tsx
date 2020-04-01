import { UploadOutlined } from '@ant-design/icons';
import { Button, message, PageHeader as AntPageHeader } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import Tone from 'tone';
import useKeyPress from '../hooks/useKeyPress';
import AudioService from '../services/AudioService';
import Dropzone from './Dropzone';
import { PageContent, PageHeader, PageLayout } from './PageLayout';
import './ProjectPage.css';
import Scrubber from './Scrubber';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import Waveform from './Waveform';

const ProjectPage = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (isPlaying) {
      Tone.Transport.start();
    } else {
      Tone.Transport.pause();
    }
  }, [isPlaying]);

  useKeyPress(() => setIsPlaying(prevIsPlaying => !prevIsPlaying), {
    targetKey: ' '
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
      const channel = AudioService.createChannel(decodedData);
      setAudioBuffers(prevBuffers => [...prevBuffers, decodedData]);
      message.success({ content: file.name, key: messageKey });
    };
    reader.readAsArrayBuffer(file);
  }

  const stopPlayback = () => {
    Tone.Transport.stop();
    setIsPlaying(false);
  };

  // TODO: optimize rendering with React.memo, React.useMemo and React.useCallback
  const pixelsPerSecond = 200;
  const memoizedScrubber = useMemo(
    () => (
      <Scrubber
        isPlaying={isPlaying}
        stopPlayback={stopPlayback}
        pixelsPerSecond={pixelsPerSecond}
      >
        <Timeline>
          {audioBuffers.map(buffer => (
            <Waveform audioBuffer={buffer} pixelsPerSecond={pixelsPerSecond} />
          ))}
        </Timeline>
      </Scrubber>
    ),
    [isPlaying, audioBuffers, pixelsPerSecond]
  );

  const isFileDragging = useFileDragging();

  const history = useHistory();

  console.log('ProjectPage render');

  return (
    <PageLayout>
      <PageHeader>
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
              onClick={() => alert('Not implemented.')}
            />
          ]}
        />
      </PageHeader>
      <PageContent>
        <div className="project">
          <div className="editor">
            {memoizedScrubber}
            {isFileDragging && (
              <div className="editor__dropzone">
                <Dropzone uploadFile={uploadFile} />
              </div>
            )}
          </div>
          <Toolbar isPlaying={isPlaying} setIsPlaying={setIsPlaying} />
        </div>
      </PageContent>
    </PageLayout>
  );
};

const useFileDragging = () => {
  const [isFileDragged, setIsFileDragged] = useState(false);
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
      setIsFileDragged(true);
    }
  };

  const onDragLeave = (event: DragEvent) => {
    // FIXME: does not trigger correctly when drag leaves window
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsFileDragged(false);
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsFileDragged(false);
  };

  return isFileDragged;
};

export default ProjectPage;
