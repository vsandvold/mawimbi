import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Track } from '../project/useProjectState';

type WaveformProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const Waveform = ({ height, pixelsPerSecond, track }: WaveformProps) => {
  console.log('Waveform render');

  const containerRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<WaveSurfer>();

  const { audioBuffer, color, volume } = track;

  useEffect(() => {
    const defaultParams = {
      backgroundColor: 'transparent',
      cursorColor: 'transparent',
      fillParent: false,
      scrollParent: false,
      interact: false,
    };
    const { r, g, b } = color;
    const waveColor = `rgb(${r},${g},${b})`;
    waveformRef.current = WaveSurfer.create({
      ...defaultParams,
      container: containerRef.current,
      height,
      minPxPerSec: pixelsPerSecond,
      waveColor,
    });
    waveformRef.current.loadDecodedBuffer(audioBuffer);
  }, [audioBuffer, color, height, pixelsPerSecond]);

  const opacity = convertToOpacity(volume);

  return <div ref={containerRef} style={{ opacity }} />;
};

function convertToOpacity(value: number): string {
  return (value / 100).toFixed(2);
}

export default Waveform;
