import React from 'react';
import { Route, Switch, useLocation } from 'react-router-dom';
import App from './App';
import HomePage from './HomePage';

// TODO: prevent navigation away from unsave wave
// https://reacttraining.com/react-router/web/example/preventing-transitions

// TODO: rename to App
const AppRouter = () => {
  return (
    <div>
      <Switch>
        <Route exact path="/">
          <HomePage />
        </Route>
        <Route path="/wave">
          <App />
        </Route>
        <Route path="*">
          <NoMatch />
        </Route>
      </Switch>
    </div>
  );
};

export const NoMatch = () => {
  let location = useLocation();

  return (
    <div>
      <h3>
        No match for <code>{location.pathname}</code>
      </h3>
    </div>
  );
};

export default AppRouter;
