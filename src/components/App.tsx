import React from 'react';
import { Route, Switch, useLocation } from 'react-router-dom';
import HomePage from './home/HomePage';
import ProjectPage from './project/ProjectPage';

// TODO: prevent navigation away from unsaved project
// https://reacttraining.com/react-router/web/example/preventing-transitions

const App = () => {
  return (
    <>
      <Switch>
        <Route exact path="/">
          <HomePage />
        </Route>
        <Route path="/project">
          <ProjectPage />
        </Route>
        <Route path="*">
          <NoMatch />
        </Route>
      </Switch>
    </>
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
