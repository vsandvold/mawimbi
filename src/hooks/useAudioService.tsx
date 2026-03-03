import React, { createContext, useContext } from 'react';
import AudioService from '../services/AudioService';

export const AudioServiceContext = createContext<AudioService>(
  AudioService.getInstance(),
);

export const useAudioService = (): AudioService => {
  return useContext(AudioServiceContext);
};

export const AudioServiceProvider = (props: React.PropsWithChildren) => {
  return (
    <AudioServiceContext.Provider value={AudioService.getInstance()}>
      {props.children}
    </AudioServiceContext.Provider>
  );
};
