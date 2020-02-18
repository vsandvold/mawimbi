import React from 'react';
import { Layout , message } from 'antd';
import Dropzone from './Dropzone';
import './App.css';

function uploadFile(file: File) {
  const reader = new FileReader()

  reader.onabort = () => message.info('file reading was aborted')
  reader.onerror = () => message.error('file reading has failed')
  reader.onload = () => message.success(file.name)

  reader.readAsArrayBuffer(file)
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
            <div className="toolbar__transport">
              Transport
            </div>
            <div className="toolbar__scrubber">
              Scrubber
            </div>
            <div className="toolbar__mixer">
              Mixer
            </div>
          </div>
        </div>
    </Layout>
  );
}

export default App;
