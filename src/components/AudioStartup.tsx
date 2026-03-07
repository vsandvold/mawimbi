import { useEffect, useRef } from 'react';
import AudioService from '../services/AudioService';
import useMessage from './message';

const AudioStartup = () => {
  const message = useMessage();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    AudioService.startAudio()
      .then(() => console.log('audio is ready'))
      .catch(() => {
        message('failed to start audio', {
          type: 'error',
          key: 'audio-startup',
        });
      });
  }, [message]);

  return null;
};

export default AudioStartup;
