import React from 'react';
import { Route, Switch, useLocation } from 'react-router-dom';
import HomePage from './HomePage';
import ProjectPage from './ProjectPage';

// TODO: prevent navigation away from unsaved project
// https://reacttraining.com/react-router/web/example/preventing-transitions

const App = () => {
  return (
    <div>
      <Switch>
        <Route exact path="/">
          <HomePage />
        </Route>
        <Route path="/wave">
          <ProjectPage />
        </Route>
        <Route path="*">
          <NoMatch />
        </Route>
      </Switch>
    </div>
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
