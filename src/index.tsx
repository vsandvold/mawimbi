import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntApp, ConfigProvider, message, theme } from 'antd';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BrowserSupportProvider } from './browserSupport';
import App from './components/App';
import * as Tone from 'tone';
import './index.css';
import AudioService from './services/AudioService';

// Reduce scheduling lookahead from the default 0.1s to 0.05s for lower
// recording latency while keeping enough headroom to avoid scheduling glitches
// with many concurrent players (Tone.js issue #711).
const RECORDING_LOOK_AHEAD = 0.05;

Tone.setContext(
  new Tone.Context({
    latencyHint: 'interactive',
    lookAhead: RECORDING_LOOK_AHEAD,
  }),
);

AudioService.startAudio()
  .then(() => console.log('audio is ready'))
  .catch(() => message.error('failed to start audio'));

const root = createRoot(document.getElementById('root')!);
root.render(
  <StyleProvider layer>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        // antd v5 Layout.Header defaults to #001529 even in dark mode;
        // override to match colorBgContainer (#141414) used in antd v4 dark theme
        components: { Layout: { headerBg: '#141414' } },
      }}
    >
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
