import React, { useEffect, useLayoutEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Track } from '../project/useProjectState';

type WaveformProps = {
  track: Track;
  pixelsPerSecond: number;
};

const Waveform = ({ track, pixelsPerSecond }: WaveformProps) => {
  console.log('Waveform render');

  const { audioBuffer, color, volume } = track;

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
    const { r, g, b } = color;
    const waveColor = `rgb(${r},${g},${b})`;
    waveformRef.current = WaveSurfer.create({
      ...defaultParams,
      container: containerRef.current,
      height: heightRef.current,
      minPxPerSec: pixelsPerSecond,
      waveColor,
    });
    waveformRef.current.loadDecodedBuffer(audioBuffer);
  }, [audioBuffer, color, pixelsPerSecond]);

  function convertToOpacity(value: number) {
    return (value / 100).toFixed(2);
  }

  const opacity = convertToOpacity(volume);

  return <div ref={containerRef} style={{ opacity }} />;
};

export default Waveform;
