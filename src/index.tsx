import { message } from 'antd';
import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import { BrowserSupportProvider } from './browserSupport';
import App from './components/App';
import './index.css';
import AudioService from './services/AudioService';
import reportWebVitals from './reportWebVitals';

AudioService.startAudio()
  .then(() => console.log('audio is ready'))
  .catch(() => message.error('failed to start audio'));

ReactDOM.render(
  <BrowserSupportProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </BrowserSupportProvider>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
