import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import useMessage from '../hooks/useMessage';
import AudioService from '../services/AudioService';
import HomePage from './home/HomePage';
import ProjectPage from './project/ProjectPage';

const useAudioStartup = () => {
  const message = useMessage();

  useEffect(() => {
    AudioService.startAudio()
      .then(() => console.log('audio is ready'))
      .catch(() =>
        message({ key: 'audio-startup' }).error('Failed to start audio'),
      );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
};

const App = () => {
  useAudioStartup();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/project" element={<ProjectPage />} />
      <Route path="*" element={<NoMatch />} />
    </Routes>
  );
};

export const NoMatch = () => {
  const location = useLocation();

  return (
    <div>
      <h3>
        No match for <code>{location.pathname}</code>
      </h3>
    </div>
  );
};

export default App;
