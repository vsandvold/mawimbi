import React, { createContext, useContext } from 'react';
import AudioService from '../services/AudioService';
import type PlaybackService from '../services/PlaybackService';
import type RecordingService from '../services/RecordingService';
import type TrackService from '../services/TrackService';

export const AudioServiceContext = createContext<AudioService>(
  AudioService.getInstance(),
);

export const useAudioService = (): AudioService => {
  return useContext(AudioServiceContext);
};

export const usePlaybackService = (): PlaybackService => {
  return useContext(AudioServiceContext).playbackService;
};

export const useRecordingService = (): RecordingService => {
  return useContext(AudioServiceContext).recordingService;
};

export const useTrackService = (): TrackService => {
  return useContext(AudioServiceContext).trackService;
};

export const AudioServiceProvider = (props: React.PropsWithChildren) => {
  return (
    <AudioServiceContext.Provider value={AudioService.getInstance()}>
      {props.children}
    </AudioServiceContext.Provider>
  );
};
