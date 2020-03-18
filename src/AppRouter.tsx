import React from 'react';
import { Route, Switch } from 'react-router-dom';
import App from './App';
import HomePage from './HomePage';

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
      </Switch>
    </div>
  );
};

export default AppRouter;
