import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

type WaveformProps = {
  audioBuffer: AudioBuffer;
  waveColor?: string;
};

const Waveform = ({ audioBuffer, waveColor = 'violet' }: WaveformProps) => {
  const waveformRef = useRef(WaveSurfer);
  const containerRef = useRef(null);

  useEffect(() => {
    waveformRef.current = WaveSurfer.create({
      container: containerRef.current,
      waveColor
    });
    waveformRef.current.loadDecodedBuffer(audioBuffer);
  }, []); // Make sure the effect runs only once

  return <div ref={containerRef} />;
};

export default Waveform;
