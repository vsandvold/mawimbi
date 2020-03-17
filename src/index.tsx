import { message } from 'antd';
import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router } from 'react-router-dom';
import AppRouter from './AppRouter';
import './index.css';
import AudioService from './services/AudioService';
import * as serviceWorker from './serviceWorker';

AudioService.startAudio().then(() => {
  message.success('Audio context started');
});

ReactDOM.render(
  <Router>
    <AppRouter />
  </Router>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
