import React from 'react';
import { Layout, message, PageHeader } from 'antd';
import Tone from 'tone';
import Dropzone from './Dropzone';
import './App.css';

const { Header, Content } = Layout;

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
      <Header className="app__header">
        <PageHeader
          className="site-page-header"
          onBack={() => window.history.back()}
          title="Mawimbi"
          subTitle="New Waves"
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
            <div className="toolbar__transport">Transport</div>
            <div className="toolbar__scrubber">Scrubber</div>
            <div className="toolbar__mixer">Mixer</div>
          </div>
        </div>
      </Content>
    </Layout>
  );
};

export default App;
