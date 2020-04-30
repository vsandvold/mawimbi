import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useKeypress from '../../hooks/useKeypress';
import AudioService from '../../services/AudioService';
import { Track } from '../project/projectReducer';
import {
  SET_MUTED_TRACKS,
  TOGGLE_PLAYBACK,
  WorkstationAction,
  WorkstationState,
} from './workstationReducer';

const useWorkstationEffects = (
  props: { tracks: Track[] },
  state: WorkstationState,
  dispatch: React.Dispatch<WorkstationAction>
) => {
  const { tracks } = props;
  const { isPlaying, transportTime } = state;

  /*
   * Compute muted tracks.
   */

  useEffect(() => {
    function isTrackMuted(track: Track, hasSoloTracks: boolean): boolean {
      return !track.solo && (track.mute || (hasSoloTracks && !track.solo));
    }

    const hasSoloTracks = tracks.filter((track) => track.solo).length > 0;
    const mutedTracks = tracks
      .filter((track) => isTrackMuted(track, hasSoloTracks))
      .map((track) => track.id);
    dispatch([SET_MUTED_TRACKS, mutedTracks]);
  }, [tracks]); // dispatch never changes, and can safely be omitted from dependencies

  /*
   * Use spacebar to toggle playback.
   */

  useKeypress(() => dispatch([TOGGLE_PLAYBACK]), {
    targetKey: ' ',
  });

  /*
   * Toggle audio playback.
   */

  useEffect(() => {
    if (isPlaying) {
      AudioService.startPlayback();
    } else {
      AudioService.pausePlayback();
    }
  }, [isPlaying]);

  /*
   * Set transport time.
   */

  useEffect(() => {
    AudioService.setTransportTime(transportTime);
  }, [transportTime]);

  /*
   * Get height of mixer drawer.
   */

  const drawerContainerRef = useRef<HTMLDivElement>(null);
  const [drawerHeight, setDrawerHeight] = useState(0);

  useLayoutEffect(() => {
    if (drawerContainerRef.current) {
      // TODO: or use clientHeight?
      const drawerHeight = drawerContainerRef.current.offsetHeight;
      setDrawerHeight(drawerHeight);
    }
  }, []); // make sure effect only triggers once, on component mount

  /*
   * Activate dropzone on file drag
   */

  const [isDragActive, setIsDragActive] = useState(false);
  const [dropzoneRootProps, setDropzoneRootProps] = useState({});

  return {
    drawerContainerRef,
    drawerHeight,
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  };
};

export default useWorkstationEffects;
