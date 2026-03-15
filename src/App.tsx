import { Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './features/home/HomePage';
import ProjectPage from './features/project/ProjectPage';
import SettingsPage from './features/settings/SettingsPage';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/project/:id" element={<ProjectPage />} />
      <Route path="/settings" element={<SettingsPage />} />
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
