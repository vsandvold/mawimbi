import { message } from 'antd';
import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import App from './components/App';
import './index.css';
import AudioService from './services/AudioService';
import * as serviceWorker from './serviceWorker';

AudioService.startAudio()
  .then(() => console.log('audio is ready'))
  .catch(() => message.error('failed to start audio'));

ReactDOM.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();

window.addEventListener('load', function () {
  setTimeout(function () {
    // Hide the address bar
    window.scrollTo(0, 1);
  }, 0);
});
