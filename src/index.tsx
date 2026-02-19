import { App as AntApp, ConfigProvider, message, theme } from 'antd';
import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import { BrowserSupportProvider } from './browserSupport';
import App from './components/App';
import './index.css';
import AudioService from './services/AudioService';

AudioService.startAudio()
  .then(() => console.log('audio is ready'))
  .catch(() => message.error('failed to start audio'));

ReactDOM.render(
  <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
    <AntApp>
      <BrowserSupportProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </BrowserSupportProvider>
    </AntApp>
  </ConfigProvider>,
  document.getElementById('root'),
);
