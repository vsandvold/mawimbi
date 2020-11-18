import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useKeypress from '../../hooks/useKeypress';
import AudioService from '../../services/AudioService';
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

export const usePlaybackToggle = (isPlaying: boolean) => {
  useEffect(() => {
    if (isPlaying) {
      AudioService.startPlayback();
    } else {
      AudioService.pausePlayback();
    }
  }, [isPlaying]);
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

export const useTransportTime = (transportTime: number) => {
  useEffect(() => {
    AudioService.setTransportTime(transportTime);
  }, [transportTime]);
};

export const useMixerDrawerHeight = () => {
  const drawerContainerRef = useRef<HTMLDivElement>(null);
  const [drawerHeight, setDrawerHeight] = useState(0);

  useLayoutEffect(() => {
    if (drawerContainerRef.current) {
      // TODO: or use clientHeight?
      const drawerHeight = drawerContainerRef.current.offsetHeight;
      setDrawerHeight(drawerHeight);
    }
  }, []); // make sure effect only triggers once, on component mount

  return {
    drawerContainerRef,
    drawerHeight,
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
