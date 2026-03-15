import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BrowserSupportProvider } from './browserSupport';
import App from './App';
import AudioStartup from './features/audio/AudioStartup';
import { Toaster } from './shared/ui/sonner';
import { ThemeProvider } from './shared/hooks/useTheme';
import LogService from './shared/log/LogService';
import './index.css';

// Intercept console methods before any logging occurs
LogService.install();

const root = createRoot(document.getElementById('root')!);
root.render(
  <>
    <AudioStartup />
    <ThemeProvider>
      <BrowserSupportProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </BrowserSupportProvider>
      <Toaster />
    </ThemeProvider>
  </>,
);
