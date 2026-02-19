import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntApp, ConfigProvider, message, theme } from 'antd';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BrowserSupportProvider } from './browserSupport';
import App from './components/App';
import './index.css';
import AudioService from './services/AudioService';

AudioService.startAudio()
  .then(() => console.log('audio is ready'))
  .catch(() => message.error('failed to start audio'));

const root = createRoot(document.getElementById('root')!);
root.render(
  <StyleProvider layer>
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <AntApp>
        <BrowserSupportProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </BrowserSupportProvider>
      </AntApp>
    </ConfigProvider>
  </StyleProvider>,
);
