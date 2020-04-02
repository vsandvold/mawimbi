import React, { useEffect, useLayoutEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

type WaveformProps = {
  audioBuffer: AudioBuffer;
  pixelsPerSecond: number;
  waveColor?: string;
};

const Waveform = ({
  audioBuffer,
  pixelsPerSecond,
  waveColor = 'violet',
}: WaveformProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(0);

  useLayoutEffect(() => {
    if (containerRef.current) {
      const { height } = containerRef.current.getBoundingClientRect();
      heightRef.current = height;
    }
  }, []);

  const waveformRef = useRef<WaveSurfer>();

  useEffect(() => {
    const defaultParams = {
      backgroundColor: 'transparent',
      fillParent: false,
      scrollParent: false,
      interact: false,
    };
    waveformRef.current = WaveSurfer.create({
      ...defaultParams,
      container: containerRef.current,
      minPxPerSec: pixelsPerSecond,
      height: heightRef.current,
      waveColor,
    });
    waveformRef.current.loadDecodedBuffer(audioBuffer);
  }, [audioBuffer, pixelsPerSecond, waveColor]);

  console.log('Waveform render');

  return <div ref={containerRef} />;
};

export default Waveform;
