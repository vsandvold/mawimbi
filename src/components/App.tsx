import React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './home/HomePage';
import ProjectPage from './project/ProjectPage';

const App = () => {
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
