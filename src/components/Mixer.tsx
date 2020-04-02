import React from 'react';
import Channel from './Channel';
import './Mixer.css';

type MixerProps = {
  audioBuffers: AudioBuffer[];
};

const Mixer = ({ audioBuffers }: MixerProps) => {
  console.log('Mixer render');

  return (
    <div className="mixer">
      {audioBuffers.map((buffer) => (
        <Channel audioBuffer={buffer} />
      ))}
    </div>
  );
};

export default Mixer;
