import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BrowserSupportProvider } from './browserSupport';
import App from './components/App';
import AudioStartup from './components/AudioStartup';
import LogService from './services/LogService';
import './index.css';

// Intercept console methods before any logging occurs
LogService.install();

const root = createRoot(document.getElementById('root')!);
root.render(
  <StyleProvider layer>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
      <AntApp>
        <AudioStartup />
        <BrowserSupportProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </BrowserSupportProvider>
      </AntApp>
    </ConfigProvider>
  </StyleProvider>,
);
