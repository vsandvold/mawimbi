import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useAudioService } from '../../hooks/useAudioService';
import { Track } from '../project/projectPageReducer';

type WaveformProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const Waveform = ({ height, pixelsPerSecond, track }: WaveformProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<WaveSurfer>();

  const { trackId, color, volume } = track;

  const audioService = useAudioService();
  useEffect(() => {
    const audioBuffer = audioService.retrieveAudioBuffer(trackId)!;

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
    return () => {
      if (waveformRef.current) {
        waveformRef.current.destroy();
      }
    };
  }, [trackId, color, height, pixelsPerSecond]);

  const opacity = convertToOpacity(volume);

  return <div ref={containerRef} style={{ opacity }} />;
};

function convertToOpacity(value: number): string {
  return (value / 100).toFixed(2);
}

export default Waveform;
