import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

type WaveformProps = {
  audioBuffer: AudioBuffer;
  pixelsPerSecond: number;
  waveColor?: string;
};

const Waveform = ({
  audioBuffer,
  pixelsPerSecond,
  waveColor = 'violet'
}: WaveformProps) => {
  const waveformRef = useRef<WaveSurfer>();
  const containerRef = useRef(null);

  const defaultParams = {
    backgroundColor: '#FFFFFF00',
    fillParent: false,
    scrollParent: false,
    interact: false,
    height: 150
  };

  useEffect(() => {
    waveformRef.current = WaveSurfer.create({
      ...defaultParams,
      container: containerRef.current,
      minPxPerSec: pixelsPerSecond,
      waveColor
    });
    waveformRef.current.loadDecodedBuffer(audioBuffer);
  }, []); // Make sure the effect runs only once

  console.log('Waveform render');

  return <div ref={containerRef} />;
};

export default Waveform;
