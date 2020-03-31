import { Button, Layout, message, PageHeader } from 'antd';
import React, { useEffect, useState, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import Tone from 'tone';
import useAnimation from '../hooks/useAnimation';
import useKeyPress from '../hooks/useKeyPress';
import AudioService from '../services/AudioService';
import Dropzone from './Dropzone';
import './ProjectPage.css';
import Waveform from './Waveform';
import Scrubber from './Scrubber';

const { Header, Content } = Layout;

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

  const [transportTime, setTransportTime] = useState(0);

  useAnimation(
    () => {
      const transportSeconds = parseFloat(Tone.Transport.seconds.toFixed(1));
      setTransportTime(transportSeconds);
      return transportSeconds;
    },
    [],
    { frameRate: 10, initialValue: Tone.Transport.seconds, isActive: true }
  );

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
        {audioBuffers.map(buffer => (
          <Waveform audioBuffer={buffer} pixelsPerSecond={pixelsPerSecond} />
        ))}
      </Scrubber>
    ),
    [isPlaying, audioBuffers, pixelsPerSecond]
  );

  const history = useHistory();

  console.log('ProjectPage render');

  return (
    <Layout className="app">
      <Header className="app__header">
        <PageHeader
          className="site-page-header"
          onBack={() => history.goBack()}
          title="Mawimbi"
          subTitle="New Wave"
        />
      </Header>
      <Content className="app__content">
        <div className="app__tracker">
          <div className="tracker">
            <div className="tracker__track">
              <Dropzone uploadFile={uploadFile} />
            </div>
            <div className="tracker__track">{memoizedScrubber}</div>
          </div>
        </div>
        <div className="app__toolbar">
          <div className="toolbar">
            <Button
              onClick={() => setIsPlaying(prevIsPlaying => !prevIsPlaying)}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            {transportTime}
          </div>
        </div>
      </Content>
    </Layout>
  );
};

export default ProjectPage;
