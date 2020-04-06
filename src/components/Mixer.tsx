import React from 'react';
import Channel from './Channel';
import './Mixer.css';
import { Track } from '../reducers/projectReducer';

type MixerProps = {
  tracks: Track[];
};

const Mixer = ({ tracks }: MixerProps) => {
  console.log('Mixer render');

  return (
    <div className="mixer">
      {tracks.map((track) => (
        <Channel key={track.id} track={track} />
      ))}
    </div>
  );
};

export default Mixer;
