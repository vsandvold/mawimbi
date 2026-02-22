import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useAudioService } from '../../hooks/useAudioService';
import { useTrackVolume } from '../../hooks/useTrackVolume';
import { Track } from '../project/projectPageReducer';

type WaveformProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const Waveform = ({ height, pixelsPerSecond, track }: WaveformProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<WaveSurfer | undefined>(undefined);

  const { trackId, color } = track;

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
  }, [trackId, color, height, pixelsPerSecond]);

  const { opacity } = useTrackVolume(trackId);

  return <div ref={containerRef} style={{ opacity }} />;
};

export default Waveform;
