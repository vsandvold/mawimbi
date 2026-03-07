import { useEffect, useRef } from 'react';
import AudioService from '../services/AudioService';
import LogService from '../services/LogService';
import useMessage from './message';

const AudioStartup = () => {
  const message = useMessage();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    AudioService.startAudio()
      .then(() => LogService.log('audio is ready'))
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
