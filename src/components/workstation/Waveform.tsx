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
  const waveformRef = useRef<WaveSurfer | undefined>(undefined);

  const { trackId, color, volume } = track;

  const audioService = useAudioService();

  useEffect(() => {
    if (!containerRef.current) return;
    const { r, g, b } = color;
    const waveColor = `rgb(${r},${g},${b})`;
    waveformRef.current = WaveSurfer.create({
      container: containerRef.current,
      height,
      minPxPerSec: pixelsPerSecond,
      waveColor,
      cursorColor: 'transparent',
      fillParent: false,
      interact: false,
    });
    const blobUrl = audioService.retrieveBlobUrl(trackId);
    if (blobUrl) {
      waveformRef.current.load(blobUrl);
    }
    return () => {
      waveformRef.current?.destroy();
    };
  }, [trackId, color, height, pixelsPerSecond]); // audioService never changes, and can safely be omitted from dependencies

  const opacity = convertToOpacity(volume);

  return <div ref={containerRef} style={{ opacity }} />;
};

function convertToOpacity(value: number): string {
  return (value / 100).toFixed(2);
}

export default Waveform;
