import { Button, Layout, message, PageHeader } from 'antd';
import React, { useEffect, useState } from 'react';
import Tone from 'tone';
import './App.css';
import Dropzone from './Dropzone';
import useAnimation from './hooks/useAnimation';
import useKeyPress from './hooks/useKeyPress';
import AudioService from './services/AudioService';

const { Header, Content } = Layout;

function uploadFile(file: File) {
  const messageKey = 'uploadFile';
  const reader = new FileReader();
  reader.onabort = () => message.info({ content: file.name, key: messageKey });
  reader.onerror = () => message.error({ content: file.name, key: messageKey });
  reader.onload = async () => {
    message.loading({ content: file.name, key: messageKey });
    const decodedData = await AudioService.decodeAudioData(
      reader.result as ArrayBuffer
    );
    const channel = AudioService.createChannel(decodedData);
    message.success({ content: file.name, key: messageKey });
  };
  reader.readAsArrayBuffer(file);
}

const types = {
  TOGGLE_PLAYING: 'TOGGLE_PLAYING'
};

const initialState = {
  isPlaying: false
};

// TODO: fix state and action types
function reducer(state: any, action: any) {
  switch (action.type) {
    case types.TOGGLE_PLAYING:
      return { ...state, isPlaying: !state.isPlaying };
    default:
      throw new Error();
  }
}

const App = () => {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const { isPlaying } = state;

  useEffect(() => {
    if (isPlaying) {
      Tone.Transport.start();
    } else {
      Tone.Transport.pause();
    }
  }, [isPlaying]);

  useKeyPress(
    () => {
      dispatch({ type: types.TOGGLE_PLAYING });
    },
    { targetKey: ' ' }
  );

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

  // TODO: use React.memo
  return (
    <Layout className="app">
      <Header className="app__header">
        <PageHeader
          className="site-page-header"
          onBack={() => window.history.back()}
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
          </div>
        </div>
        <div className="app__toolbar">
          <div className="toolbar">
            <Button onClick={() => Tone.Transport.stop()}>Rewind</Button>
            <Button onClick={() => dispatch({ type: types.TOGGLE_PLAYING })}>
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            {transportTime}
          </div>
        </div>
      </Content>
    </Layout>
  );
};

export default App;
