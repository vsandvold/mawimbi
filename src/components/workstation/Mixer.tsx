import React from 'react';
import { Track } from '../project/useProjectState';
import Channel from './Channel';
import './Mixer.css';

type MixerProps = {
  mutedTracks: number[];
  tracks: Track[];
};

const Mixer = ({ mutedTracks, tracks }: MixerProps) => {
  console.log('Mixer render');

  return (
    <div className="mixer">
      {tracks.map((track) => {
        const isMuted = mutedTracks.includes(track.id);
        return <Channel key={track.id} isMuted={isMuted} track={track} />;
      })}
    </div>
  );
};

export default Mixer;
