import React from 'react';
import { Layout, message } from 'antd';
import Tone from 'tone';
import Dropzone from './Dropzone';
import './App.css';

function uploadFile(file: File) {
  const messageKey = 'uploadFile';

  const reader = new FileReader();

  reader.onabort = () => message.info({ content: file.name, key: messageKey });
  reader.onerror = () => message.error({ content: file.name, key: messageKey });
  reader.onload = async () => {
    message.loading({ content: file.name, key: messageKey });
    const decodedData = await Tone.context.decodeAudioData(
      reader.result as ArrayBuffer
    );
    const player = new Tone.Player(decodedData).toMaster().start();
    message.success({ content: file.name, key: messageKey });
  };

  reader.readAsArrayBuffer(file);
}

const App = () => {
  return (
    <Layout className="app">
      <div className="app__tracker">
        <div className="tracker">
          <div className="tracker__track">
            <Dropzone uploadFile={uploadFile} />
          </div>
        </div>
      </div>
      <div className="app__toolbar">
        <div className="toolbar">
          <div className="toolbar__transport">Transport</div>
          <div className="toolbar__scrubber">Scrubber</div>
          <div className="toolbar__mixer">Mixer</div>
        </div>
      </div>
    </Layout>
  );
};

export default App;
