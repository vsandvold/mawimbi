import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import useKeypress from '../../hooks/useKeypress';
import { Track } from '../project/projectPageReducer';
import {
  SET_MUTED_TRACKS,
  SET_TOTAL_TIME,
  TOGGLE_PLAYBACK,
  WorkstationAction,
} from './workstationReducer';

export const useMutedTracks = (
  tracks: Track[],
  dispatch: React.Dispatch<WorkstationAction>
) => {
  useEffect(() => {
    function isTrackMuted(track: Track, hasSoloTracks: boolean): boolean {
      return track.mute || (hasSoloTracks && !track.solo);
    }

    const hasSoloTracks = tracks.filter((track) => track.solo).length > 0;
    const mutedTracks = tracks
      .filter((track) => isTrackMuted(track, hasSoloTracks))
      .map((track) => track.id);
    dispatch([SET_MUTED_TRACKS, mutedTracks]);
  }, [tracks]); // dispatch never changes, and can safely be omitted from dependencies
};

export const useSpacebarPlaybackToggle = (
  dispatch: React.Dispatch<WorkstationAction>
) => {
  useKeypress(() => dispatch([TOGGLE_PLAYBACK]), {
    targetKey: ' ',
  });
};

export const usePlaybackControl = (
  isPlaying: boolean,
  transportTime: number
) => {
  const audioService = useAudioService();
  useEffect(() => {
    if (isPlaying) {
      audioService.startPlayback(transportTime);
    } else {
      audioService.pausePlayback(transportTime);
    }
  }, [isPlaying, transportTime]); // audioService never changes, and can safely be omitted from dependencies
};

export const useTotalTime = (
  tracks: Track[],
  dispatch: React.Dispatch<WorkstationAction>
) => {
  useEffect(() => {
    const maxDuration = tracks
      .map((track) => track.audioBuffer.duration)
      .reduce((prev, curr) => (prev >= curr ? prev : curr), 0);
    dispatch([SET_TOTAL_TIME, maxDuration]);
  }, [tracks]); // dispatch never changes, and can safely be omitted from dependencies
};

export const useMicrophone = (isRecording: boolean) => {
  const audioService = useAudioService();
  useEffect(() => {
    if (isRecording) {
      audioService.microphone.open();
    } else {
      audioService.microphone.close();
    }
  }, [isRecording]); // audioService never changes, and can safely be omitted from dependencies
};

export const useMixerHeight = () => {
  const mixerContainerRef = useRef<HTMLDivElement>(null);
  const [mixerHeight, setMixerHeight] = useState(0);

  useLayoutEffect(() => {
    if (mixerContainerRef.current) {
      // TODO: or use clientHeight?
      const height = mixerContainerRef.current.offsetHeight;
      setMixerHeight(height);
    }
  }, []); // make sure effect only triggers once, on component mount

  return {
    mixerContainerRef,
    mixerHeight,
  };
};

export const useDropzoneDragActive = () => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dropzoneRootProps, setDropzoneRootProps] = useState({});

  return {
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  };
};
