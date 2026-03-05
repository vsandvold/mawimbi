import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BrowserSupportProvider } from './browserSupport';
import App from './components/App';
import './index.css';

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
