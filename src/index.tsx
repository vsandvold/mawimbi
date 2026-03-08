import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BrowserSupportProvider } from './browserSupport';
import App from './components/App';
import AudioStartup from './components/AudioStartup';
import { Toaster } from './components/ui/sonner';
import { ThemeProvider } from './hooks/useTheme';
import LogService from './services/LogService';
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
