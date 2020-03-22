import { Button, Layout, message, PageHeader } from 'antd';
import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import Tone from 'tone';
import useAnimation from '../hooks/useAnimation';
import useKeyPress from '../hooks/useKeyPress';
import AudioService from '../services/AudioService';
import Dropzone from './Dropzone';
import './ProjectPage.css';
import Waveform from './Waveform';

const { Header, Content } = Layout;

const ProjectPage = () => {
  const [isPlaying, setPlaying] = useState(false);

  useEffect(() => {
    if (isPlaying) {
      Tone.Transport.start();
    } else {
      Tone.Transport.pause();
    }
  }, [isPlaying]);

  useKeyPress(() => setPlaying(prevIsPlaying => !prevIsPlaying), {
    targetKey: ' '
  });

  const [transportTime, setTransportTime] = useState(0);

  useAnimation(
    (previousValue: number) => {
      // Pass on a function to the setter of the state
      // to make sure we always have the latest state
      const transportSeconds = Tone.Transport.seconds;
      setTransportTime(transportSeconds);
      return transportSeconds;
    },
    { frameRate: 5, initialValue: Tone.Transport.seconds }
  );

  const [audioBuffers, setAudioBuffers] = useState([] as AudioBuffer[]);

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

  const history = useHistory();

  // TODO: optimize component rendering with React.memo, React.useMemo and React.useCallback
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
            {audioBuffers.map(buffer => (
              <div className="tracker__track">
                <Waveform audioBuffer={buffer} />
              </div>
            ))}
          </div>
        </div>
        <div className="app__toolbar">
          <div className="toolbar">
            <Button onClick={() => Tone.Transport.stop()}>Rewind</Button>
            <Button onClick={() => setPlaying(prevIsPlaying => !prevIsPlaying)}>
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
