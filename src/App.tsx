import React from 'react';
import { Layout } from 'antd';
import './App.css';

const App = () => {
  return (
    <Layout className="app">
        <div className="app__tracker">
          Tracker
        </div>
        <div className="app__toolbar">
          <div className="toolbar">
            <div className="toolbar__transport">
              Transport
            </div>
            <div className="toolbar__scrubber">
              Scrubber
            </div>
            <div className="toolbar__mixer">
              Mixer
            </div>
          </div>
        </div>
    </Layout>
  );
}

export default App;
