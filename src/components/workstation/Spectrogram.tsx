import React, { useEffect, useRef } from 'react';
import OfflineAnalyser from '../../services/OfflineAnalyser';
import { Track, TrackColor } from '../project/projectPageReducer';
import './Spectrogram.css';

type SpectrogramProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const Spectrogram = ({ height, pixelsPerSecond, track }: SpectrogramProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { audioBuffer, color, volume } = track;

  const offlineAnalyser = new OfflineAnalyser(audioBuffer);

  const frequencyBinCount = offlineAnalyser.frequencyBinCount;
  const timeResolution = offlineAnalyser.timeResolution;

  const heightPixelRatio = height / frequencyBinCount;
  const heightFactor = Math.ceil(heightPixelRatio);
  const widthFactor = Math.ceil(pixelsPerSecond * timeResolution);
  const canvasWidth = Math.trunc(audioBuffer.duration / timeResolution);
  const canvasHeight = Math.ceil(heightPixelRatio) * frequencyBinCount;

  useEffect(() => {
    if (canvasRef.current) {
      const colorMap = createColorMap(color);
      const canvasContext = canvasRef.current.getContext('2d');
      const renderCallback = (
        frequencyData: Uint8Array,
        currentTime: number
      ) => {
        const x = Math.trunc(currentTime / timeResolution);
        drawSpectrogramFrame(
          frequencyData,
          canvasHeight,
          colorMap,
          canvasContext as CanvasRenderingContext2D,
          heightFactor,
          x
        );
      };
      offlineAnalyser.getLogarithmicFrequencyData(renderCallback);
    }
  }, [
    audioBuffer,
    color,
    height,
    pixelsPerSecond,
    canvasHeight,
    heightFactor,
    offlineAnalyser,
    timeResolution,
    widthFactor,
  ]);

  const containerStyles = {
    opacity: convertToOpacity(volume),
    transform: `scaleY(${heightPixelRatio})`,
    transformOrigin: 'top left',
    width: canvasWidth * widthFactor,
  };

  return (
    <div className="spectrogram" style={containerStyles}>
      <canvas
        ref={canvasRef}
        className="spectrogram__canvas"
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: canvasWidth * widthFactor,
          height: canvasHeight,
        }}
      />
    </div>
  );
};

function convertToOpacity(value: number): string {
  return (value / 100).toFixed(2);
}

function createColorMap(color: TrackColor): number[][] {
  const { r, g, b } = color;
  const colorMap = [];
  for (let i = 0; i < 256; i++) {
    const opacity = i / 256;
    colorMap.push([r, g, b, opacity]);
  }
  return colorMap;
}

function drawSpectrogramFrame(
  frequencyData: Uint8Array,
  height: number,
  colorMap: number[][],
  canvasContext: CanvasRenderingContext2D,
  heightFactor: number,
  x: number
) {
  for (let i = 0, binCount = frequencyData.length; i < binCount; i++) {
    const color = colorMap[frequencyData[i]];
    canvasContext.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    canvasContext.fillRect(x, height - i * heightFactor, 1, heightFactor);
  }
}

export default Spectrogram;
